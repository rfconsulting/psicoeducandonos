const express = require('express');
const pool = require('../config/database');
const { requireCapability, verifyCsrf } = require('../middleware/security');
const { CAPABILITIES } = require('../constants/access');
const { pagination, page } = require('../utils/pagination');
const withTransaction = require('../services/transaction');
const audit = require('../services/audit');
const { reviewTransition, TRANSITIONS } = require('../services/student-profile-review');

const router = express.Router();
const STATUSES = new Set(['submitted', 'under_review', 'changes_requested', 'approved', 'rejected']);

router.get('/', requireCapability(CAPABILITIES.STUDENT_PROFILE_REVIEW), async (req, res, next) => {
  try {
    const paging = pagination(req.query, 30, 100);
    const status = String(req.query.status || 'submitted');
    const search = String(req.query.search || '').trim().slice(0, 120);
    if (status && !STATUSES.has(status)) return res.status(422).json({ error: 'Estado de perfil inválido.' });
    const conditions = []; const values = [];
    if (status) { conditions.push('sp.review_status=?'); values.push(status); }
    if (search) { conditions.push('(u.full_name LIKE ? OR u.email LIKE ?)'); values.push(`%${search}%`, `%${search}%`); }
    if (paging.cursor) { conditions.push('sp.user_id<?'); values.push(paging.cursor); }
    values.push(paging.limit);
    const [profiles] = await pool.execute(
      `SELECT sp.user_id AS id,u.full_name AS fullName,u.email,sp.phone,sp.country,sp.province,sp.city,
       DATE_FORMAT(sp.birth_date,'%Y-%m-%d') AS birthDate,sp.document_type AS documentType,
       sp.document_number AS documentNumber,sp.profession,sp.education_level AS educationLevel,
       sp.specialization,sp.institution,sp.license_number AS licenseNumber,
       sp.years_experience AS yearsExperience,sp.pathway,sp.motivation,sp.bio,
       sp.review_status AS reviewStatus,sp.submitted_at AS submittedAt,sp.updated_at AS updatedAt
       FROM student_profiles sp JOIN users u ON u.id=sp.user_id
       ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
       ORDER BY sp.user_id DESC LIMIT ?`,
      values
    );
    const result = page(profiles, paging.limit);
    return res.json({ profiles: result.items, nextCursor: result.nextCursor });
  } catch (error) { return next(error); }
});

router.get('/:id', requireCapability(CAPABILITIES.STUDENT_PROFILE_REVIEW), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(422).json({ error: 'Perfil inválido.' });
    const [profiles] = await pool.execute(
      `SELECT sp.user_id AS id,u.full_name AS fullName,u.email,sp.phone,sp.country,sp.province,sp.city,
       DATE_FORMAT(sp.birth_date,'%Y-%m-%d') AS birthDate,sp.document_type AS documentType,
       sp.document_number AS documentNumber,sp.profession,sp.education_level AS educationLevel,
       sp.specialization,sp.institution,sp.license_number AS licenseNumber,
       sp.years_experience AS yearsExperience,sp.pathway,sp.motivation,sp.bio,
       sp.review_status AS reviewStatus,sp.submitted_at AS submittedAt,sp.approved_at AS approvedAt,
       sp.updated_at AS updatedAt FROM student_profiles sp JOIN users u ON u.id=sp.user_id
       WHERE sp.user_id=? LIMIT 1`, [id]
    );
    if (!profiles[0]) return res.status(404).json({ error: 'Perfil no encontrado.' });
    const [reviews] = await pool.execute(
      `SELECT r.id,r.from_status AS fromStatus,r.decision,r.to_status AS toStatus,r.notes,
       r.created_at AS createdAt,u.full_name AS reviewerName
       FROM student_profile_reviews r JOIN users u ON u.id=r.reviewer_user_id
       WHERE r.student_profile_user_id=? ORDER BY r.id DESC`, [id]
    );
    return res.json({ profile: profiles[0], reviews, availableDecisions: Object.keys(TRANSITIONS) });
  } catch (error) { return next(error); }
});

router.post('/:id/decisions', requireCapability(CAPABILITIES.STUDENT_PROFILE_REVIEW), verifyCsrf, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const decision = String(req.body.decision || '');
    if (!Number.isSafeInteger(id) || id < 1) return res.status(422).json({ error: 'Perfil inválido.' });
    const result = await withTransaction(async connection => {
      const [profiles] = await connection.execute(
        'SELECT user_id AS userId,review_status AS reviewStatus FROM student_profiles WHERE user_id=? FOR UPDATE', [id]
      );
      if (!profiles[0]) return { status: 404, error: 'Perfil no encontrado.' };
      const transition = reviewTransition(profiles[0].reviewStatus, decision, req.body.notes);
      if (!transition) return { status: 409, error: 'La decisión no es válida para el estado actual o requiere una nota más clara.' };
      await connection.execute(
        `INSERT INTO student_profile_reviews
         (student_profile_user_id,reviewer_user_id,from_status,decision,to_status,notes)
         VALUES (?,?,?,?,?,?)`,
        [id, req.authUser.id, transition.fromStatus, transition.decision, transition.toStatus, transition.notes]
      );
      await connection.execute(
        `UPDATE student_profiles SET review_status=?,
         approved_at=CASE WHEN ?=1 THEN UTC_TIMESTAMP() ELSE NULL END
         WHERE user_id=?`,
        [transition.toStatus, transition.toStatus === 'approved' ? 1 : 0, id]
      );
      await audit(req, 'student_profile_reviewed', 'student_profile', id, {
        decision: transition.decision, fromStatus: transition.fromStatus, toStatus: transition.toStatus
      }, { db: connection, required: true });
      return { status: 200, transition };
    });
    if (result.error) return res.status(result.status).json({ error: result.error });
    return res.json({ message: 'Decisión registrada.', reviewStatus: result.transition.toStatus });
  } catch (error) { return next(error); }
});

module.exports = router;
