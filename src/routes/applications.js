const express = require('express');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { requireCapability, verifyCsrf } = require('../middleware/security');
const { CAPABILITIES } = require('../constants/access');
const { normalizeEmail, cleanName, validEmail } = require('../validation/auth');
const { pagination, page } = require('../utils/pagination');
const withTransaction = require('../services/transaction');
const audit = require('../services/audit');
const deliverPasswordReset = require('../services/password-reset');
const {
  publicApplicationResult,
  waitForEquivalentPublicResponse
} = require('../services/public-application-response');
const {
  STUDENT_SETUP_EXPIRES_MINUTES,
  generateResetToken,
  hashResetToken
} = require('../services/password-reset-token');

const router = express.Router();
const AGE_RANGES = new Set(['18-25', '26-40', '41-60', '61-plus']);
const PATHWAYS = new Set(['accompaniment', 'health-professional']);
const SOURCES = new Set(['instagram', 'facebook', 'whatsapp', 'acquaintance', 'other']);
const STATUSES = new Set(['pending', 'reviewing', 'approved', 'waitlisted', 'rejected']);
const optionalText = (value, max) => String(value || '').trim().slice(0, max) || null;

router.post('/', verifyCsrf, async (req, res, next) => {
  const startedAt = Date.now();
  try {
    const fullName = cleanName(req.body.fullName).slice(0, 120);
    const email = normalizeEmail(req.body.email);
    const phone = String(req.body.phone || '').trim().slice(0, 40);
    const ageRange = String(req.body.ageRange || '');
    const location = String(req.body.location || '').trim().slice(0, 160);
    const pathway = String(req.body.pathway || '');
    const crisisExperience = req.body.crisisExperience === true;
    const motivation = String(req.body.motivation || '').trim().slice(0, 5000);
    const referralSource = String(req.body.referralSource || '');
    const privacyConsent = req.body.privacyConsent === true;
    const supervisionCommitment = req.body.supervisionCommitment === true;
    const newsletterConsent = req.body.newsletterConsent === true;
    const attendedInfoSession = typeof req.body.attendedInfoSession === 'boolean' ? req.body.attendedInfoSession : null;
    const sessionFeedback = attendedInfoSession ? optionalText(req.body.sessionFeedback, 5000) : null;

    const invalid = fullName.length < 3 || !validEmail(email) || phone.length < 7 || location.length < 2
      || !AGE_RANGES.has(ageRange) || !PATHWAYS.has(pathway) || !SOURCES.has(referralSource)
      || motivation.length < 20 || !privacyConsent || !supervisionCommitment;
    if (invalid) return res.status(422).json({ error: 'Revisa los campos obligatorios y los consentimientos.' });

    const [duplicates] = await pool.execute(
      "SELECT id FROM applications WHERE email=? AND status IN ('pending','reviewing','approved','waitlisted') LIMIT 1",
      [email]
    );
    if (duplicates.length) {
      await audit(req, 'application_duplicate_ignored', 'application', duplicates[0].id);
      await waitForEquivalentPublicResponse(startedAt);
      const result = publicApplicationResult();
      return res.status(result.status).json(result.body);
    }
    const [users] = await pool.execute("SELECT id FROM users WHERE email=? AND role='student' LIMIT 1", [email]);

    await withTransaction(async connection => {
      const [result] = await connection.execute(
        `INSERT INTO applications
         (user_id,full_name,email,phone,age_range,location,pathway,crisis_experience,motivation,
          referral_source,privacy_consent,supervision_commitment,newsletter_consent,
          attended_info_session,session_feedback)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [users[0]?.id || null, fullName, email, phone, ageRange, location, pathway, crisisExperience,
          motivation, referralSource, privacyConsent, supervisionCommitment, newsletterConsent,
          attendedInfoSession, sessionFeedback]
      );
      await audit(req, 'application_submitted', 'application', result.insertId, { pathway }, { db: connection, required: true });
    });
    await waitForEquivalentPublicResponse(startedAt);
    const result = publicApplicationResult();
    return res.status(result.status).json(result.body);
  } catch (error) {
    return next(error);
  }
});

router.get('/', requireCapability(CAPABILITIES.APPLICATION_MANAGE), async (req, res, next) => {
  try {
    const paging = pagination(req.query, 30, 100);
    const status = String(req.query.status || 'pending');
    const pathway = String(req.query.pathway || '');
    const search = String(req.query.search || '').trim().slice(0, 120);
    if (status && !STATUSES.has(status)) return res.status(422).json({ error: 'Estado inválido.' });
    if (pathway && !PATHWAYS.has(pathway)) return res.status(422).json({ error: 'Formación inválida.' });
    const conditions = []; const values = [];
    if (status) { conditions.push('a.status=?'); values.push(status); }
    if (pathway) { conditions.push('a.pathway=?'); values.push(pathway); }
    if (search) { conditions.push('(a.full_name LIKE ? OR a.email LIKE ?)'); values.push(`%${search}%`, `%${search}%`); }
    if (paging.cursor) { conditions.push('a.id<?'); values.push(paging.cursor); }
    values.push(paging.limit);
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [applications] = await pool.execute(
      `SELECT a.id,a.user_id AS userId,a.full_name AS fullName,a.email,a.phone,a.age_range AS ageRange,
              a.location,a.pathway,a.crisis_experience AS crisisExperience,a.motivation,
              a.referral_source AS referralSource,a.newsletter_consent AS newsletterConsent,
              a.attended_info_session AS attendedInfoSession,a.session_feedback AS sessionFeedback,
              a.status,a.review_notes AS reviewNotes,a.created_at AS createdAt,
              r.full_name AS reviewerName
       FROM applications a LEFT JOIN users r ON r.id=a.reviewed_by
       ${where} ORDER BY a.id DESC LIMIT ?`,
      values
    );
    const result = page(applications, paging.limit);
    return res.json({ applications: result.items, nextCursor: result.nextCursor });
  } catch (error) {
    return next(error);
  }
});

router.patch('/:id/review', requireCapability(CAPABILITIES.APPLICATION_MANAGE), verifyCsrf, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const status = String(req.body.status || '');
    const reviewNotes = optionalText(req.body.reviewNotes, 5000);
    if (!Number.isSafeInteger(id) || id < 1 || !STATUSES.has(status)) return res.status(422).json({ error: 'Revisión inválida.' });
    let setupToken = null;
    let setupEmail = null;
    let accountCreated = false;
    const result = await withTransaction(async connection => {
      const [applications] = await connection.execute(
        'SELECT id,user_id,full_name,email,status FROM applications WHERE id=? FOR UPDATE',
        [id]
      );
      const application = applications[0];
      if (!application) return null;
      let userId = application.user_id;

      if (status === 'approved' && !userId) {
        const [users] = await connection.execute('SELECT id,role FROM users WHERE email=? LIMIT 1 FOR UPDATE', [application.email]);
        if (users[0] && users[0].role !== 'student') {
          const conflict = new Error('El correo pertenece a una cuenta que no es estudiantil.');
          conflict.statusCode = 409;
          throw conflict;
        }
        if (users[0]) userId = users[0].id;
        else {
          const unusablePassword = await bcrypt.hash(crypto.randomBytes(48).toString('base64url'), 12);
          const [created] = await connection.execute(
            `INSERT INTO users (full_name,email,password_hash,role,status,email_verified_at,must_change_password)
             VALUES (?,? ,?,'student','active',UTC_TIMESTAMP(),FALSE)`,
            [application.full_name, application.email, unusablePassword]
          );
          userId = created.insertId;
          accountCreated = true;
          setupEmail = application.email;
          setupToken = generateResetToken();
          const tokenHash = hashResetToken(setupToken);
          await connection.execute(
            'INSERT INTO password_reset_tokens (user_id,token_hash,expires_at) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 24 HOUR))',
            [userId, tokenHash]
          );
          await audit(req, 'student_account_created_from_application', 'user', userId, { applicationId: id }, { db: connection, required: true });
        }
      }
      const [update] = await connection.execute(
        'UPDATE applications SET status=?,review_notes=?,reviewed_by=?,reviewed_at=UTC_TIMESTAMP(),user_id=? WHERE id=?',
        [status, reviewNotes, req.authUser.id, userId, id]
      );
      if (update.affectedRows) await audit(req, 'application_reviewed', 'application', id, { status }, { db: connection, required: true });
      return update;
    });
    if (!result?.affectedRows) return res.status(404).json({ error: 'Postulación no encontrada.' });
    let delivered = null;
    if (accountCreated && setupToken) {
      try { delivered = await deliverPasswordReset(setupEmail, setupToken, STUDENT_SETUP_EXPIRES_MINUTES); }
      catch (deliveryError) { delivered = false; console.error('Falló la entrega de activación:', deliveryError.message); }
    }
    const message = accountCreated
      ? delivered
        ? 'Postulación aprobada. La cuenta fue creada y se envió el enlace para establecer la contraseña.'
        : 'Postulación aprobada y cuenta creada. El servicio de correo no confirmó la entrega del enlace.'
      : status === 'approved'
        ? 'Postulación aprobada y vinculada con la cuenta estudiantil.'
        : 'Postulación actualizada.';
    return res.json({ message, accountCreated, setupLinkDelivered: delivered });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    return next(error);
  }
});

module.exports = router;
