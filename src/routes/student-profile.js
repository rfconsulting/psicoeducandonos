const express = require('express');
const pool = require('../config/database');
const { requireRole, verifyCsrf } = require('../middleware/security');
const withTransaction = require('../services/transaction');
const audit = require('../services/audit');
const { studentProfilePatch, completion } = require('../validation/student-profile');

const router = express.Router();
const EDITABLE_STATES = new Set(['draft', 'changes_requested']);
const CONSENT_VERSIONS = Object.freeze({ privacy: '2026-08', dataAccuracy: '2026-08' });
const PROFILE_SELECT = `SELECT user_id AS userId,phone,country,province,city,
  DATE_FORMAT(birth_date,'%Y-%m-%d') AS birthDate,document_type AS documentType,
  document_number AS documentNumber,profession,education_level AS educationLevel,
  specialization,institution,license_number AS licenseNumber,years_experience AS yearsExperience,
  pathway,motivation,bio,review_status AS reviewStatus,submitted_at AS submittedAt,
  approved_at AS approvedAt,updated_at AS updatedAt FROM student_profiles WHERE user_id=? LIMIT 1`;

function publicProfile(profile) {
  const base = profile || { reviewStatus: 'draft' };
  return { ...base, completion: completion(base), editable: EDITABLE_STATES.has(base.reviewStatus) };
}

router.get('/me', requireRole('student'), async (req, res, next) => {
  try {
    const [profiles] = await pool.execute(PROFILE_SELECT, [req.authUser.id]);
    const [consents] = await pool.execute(
      `SELECT consent_type AS type,version,accepted_at AS acceptedAt
       FROM student_profile_consents WHERE student_profile_user_id=? AND revoked_at IS NULL`,
      [req.authUser.id]
    );
    const [reviews] = await pool.execute(
      `SELECT decision,to_status AS toStatus,notes,created_at AS createdAt
       FROM student_profile_reviews WHERE student_profile_user_id=? ORDER BY id DESC LIMIT 20`,
      [req.authUser.id]
    );
    return res.json({ profile: publicProfile(profiles[0]), consents, reviews, consentVersions: CONSENT_VERSIONS });
  } catch (error) { return next(error); }
});

router.patch('/me', requireRole('student'), verifyCsrf, async (req, res, next) => {
  try {
    const values = studentProfilePatch(req.body);
    if (!values) return res.status(422).json({ error: 'Los datos del perfil no son válidos.' });
    const profile = await withTransaction(async connection => {
      const [current] = await connection.execute('SELECT review_status AS reviewStatus FROM student_profiles WHERE user_id=? FOR UPDATE', [req.authUser.id]);
      const state = current[0]?.reviewStatus || 'draft';
      if (!EDITABLE_STATES.has(state)) return null;
      const columns = Object.keys(values);
      const params = Object.values(values);
      await connection.execute(
        `INSERT INTO student_profiles (user_id,${columns.join(',')}) VALUES (?,${columns.map(() => '?').join(',')})
         ON DUPLICATE KEY UPDATE ${columns.map(column => `${column}=VALUES(${column})`).join(',')}`,
        [req.authUser.id, ...params]
      );
      await audit(req, 'student_profile_saved', 'student_profile', req.authUser.id, { fields: columns }, { db: connection, required: true });
      const [updated] = await connection.execute(PROFILE_SELECT, [req.authUser.id]);
      return updated[0];
    });
    if (!profile) return res.status(409).json({ error: 'El perfil no puede editarse en su estado actual.' });
    return res.json({ message: 'Perfil guardado.', profile: publicProfile(profile) });
  } catch (error) { return next(error); }
});

router.post('/me/submit', requireRole('student'), verifyCsrf, async (req, res, next) => {
  try {
    if (req.body.privacyAccepted !== true || req.body.dataAccuracyAccepted !== true) {
      return res.status(422).json({ error: 'Debes aceptar privacidad y confirmar que los datos son correctos.' });
    }
    const result = await withTransaction(async connection => {
      const [profiles] = await connection.execute(`${PROFILE_SELECT.replace(' LIMIT 1', '')} FOR UPDATE`, [req.authUser.id]);
      const profile = profiles[0];
      if (!profile) return { error: 'Completa tu perfil antes de enviarlo.', status: 409 };
      if (!EDITABLE_STATES.has(profile.reviewStatus)) return { error: 'El perfil ya fue enviado o revisado.', status: 409 };
      const progress = completion(profile);
      if (!progress.complete) return { error: 'Completa todos los campos obligatorios antes de enviar.', status: 422, completion: progress };
      for (const [type, version] of [['privacy', CONSENT_VERSIONS.privacy], ['data_accuracy', CONSENT_VERSIONS.dataAccuracy]]) {
        await connection.execute(
          `INSERT INTO student_profile_consents (student_profile_user_id,consent_type,version)
           VALUES (?,?,?) ON DUPLICATE KEY UPDATE accepted_at=UTC_TIMESTAMP(),revoked_at=NULL`,
          [req.authUser.id, type, version]
        );
      }
      await connection.execute(
        "UPDATE student_profiles SET review_status='submitted',submitted_at=UTC_TIMESTAMP() WHERE user_id=?",
        [req.authUser.id]
      );
      await audit(req, 'student_profile_submitted', 'student_profile', req.authUser.id, {
        consentVersions: CONSENT_VERSIONS
      }, { db: connection, required: true });
      return { submitted: true };
    });
    if (!result.submitted) return res.status(result.status).json({ error: result.error, completion: result.completion });
    return res.json({ message: 'Perfil enviado para validación.', reviewStatus: 'submitted' });
  } catch (error) { return next(error); }
});

module.exports = router;
