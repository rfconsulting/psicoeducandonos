const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { requireRole, requireCapability, verifyCsrf } = require('../middleware/security');
const audit = require('../services/audit');
const withTransaction = require('../services/transaction');
const { CAPABILITIES } = require('../constants/access');
const { pagination, page } = require('../utils/pagination');
const securityAlert = require('../services/security-alert');
const { validPassword } = require('../validation/auth');

const router = express.Router();
const ROLES = ['administrator', 'writer', 'teacher', 'student'];

router.post('/', requireCapability(CAPABILITIES.USER_CREATE), verifyCsrf, async (req, res, next) => {
  try {
    const fullName = String(req.body.fullName || '').trim().replace(/\s+/g, ' ');
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const role = String(req.body.role || 'student');
    const allowedRoles = req.session.user.role === 'superuser' ? ROLES : ['writer', 'teacher', 'student'];
    if (fullName.length < 3 || fullName.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(422).json({ error: 'Nombre o correo inválido.' });
    if (password.length < 12 || password.length > 72 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) return res.status(422).json({ error: 'La contraseña no cumple la política de seguridad.' });
    if (!allowedRoles.includes(role)) return res.status(403).json({ error: 'No puedes crear usuarios con ese rol.' });
    const hash = await bcrypt.hash(password, 12);
    try {
      const id = await withTransaction(async (connection) => {
        const [result] = await connection.execute('INSERT INTO users (full_name,email,password_hash,role,must_change_password,email_verified_at) VALUES (?,?,?,?,TRUE,UTC_TIMESTAMP())', [fullName, email, hash, role]);
        await audit(req, 'user_created', 'user', result.insertId, { role }, { db: connection, required: true });
        return result.insertId;
      });
      res.status(201).json({ message: 'Usuario creado.', id });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'No fue posible crear el usuario con esos datos.' });
      throw error;
    }
  } catch (error) { next(error); }
});

router.get('/students/tracking', requireCapability(CAPABILITIES.STUDENT_TRACK), async (req, res, next) => {
  try {
    const [students] = await pool.execute(
      `SELECT u.id,u.full_name AS fullName,u.email,u.status,
       COALESCE(t.progress,0) AS progress,COALESCE(t.stage,'not_started') AS stage,
       COALESCE(t.notes,'') AS notes,t.updated_at AS trackingUpdatedAt
       FROM users u LEFT JOIN student_tracking t ON t.student_id=u.id
       WHERE u.role='student' ORDER BY u.full_name`
    );
    res.json({ students });
  } catch (error) { next(error); }
});

router.patch('/students/:id/tracking', requireCapability(CAPABILITIES.STUDENT_TRACK), verifyCsrf, async (req, res, next) => {
  try {
    const studentId = Number(req.params.id);
    const progress = Number(req.body.progress);
    const stage = String(req.body.stage || '');
    const notes = String(req.body.notes || '').trim().slice(0, 5000);
    if (!Number.isSafeInteger(studentId) || studentId < 1 || !Number.isInteger(progress) || progress < 0 || progress > 100 || !['not_started','in_progress','completed','paused'].includes(stage)) return res.status(422).json({ error: 'Datos de seguimiento inválidos.' });
    const [student] = await pool.execute("SELECT id FROM users WHERE id=? AND role='student' LIMIT 1", [studentId]);
    if (!student.length) return res.status(404).json({ error: 'Estudiante no encontrado.' });
    await withTransaction(async (connection) => {
      await connection.execute(
        `INSERT INTO student_tracking (student_id,updated_by,progress,stage,notes) VALUES (?,?,?,?,?)
         ON DUPLICATE KEY UPDATE updated_by=VALUES(updated_by),progress=VALUES(progress),stage=VALUES(stage),notes=VALUES(notes)`,
        [studentId, req.session.user.id, progress, stage, notes]
      );
      await audit(req, 'student_tracking_updated', 'user', studentId, { progress, stage }, { db: connection, required: true });
    });
    res.json({ message: 'Seguimiento actualizado.' });
  } catch (error) { next(error); }
});

router.get('/', requireCapability(CAPABILITIES.USER_LIST), async (req, res, next) => {
  try {
    const paging = pagination(req.query, 50, 100);
    const values = [];
    const where = paging.cursor ? 'WHERE id < ?' : '';
    if (paging.cursor) values.push(paging.cursor);
    values.push(paging.limit);
    const [users] = await pool.execute(
      `SELECT id,full_name AS fullName,email,role,status,last_login_at AS lastLoginAt,created_at AS createdAt
       FROM users ${where} ORDER BY id DESC LIMIT ?`,
      values
    );
    const result = page(users, paging.limit);
    res.json({ users: result.items, nextCursor: result.nextCursor });
  } catch (error) { next(error); }
});

router.patch('/:id/role', requireCapability(CAPABILITIES.USER_ROLE_CHANGE), verifyCsrf, async (req, res, next) => {
  try {
    const targetId = Number(req.params.id);
    const role = String(req.body.role || '');
    if (!Number.isSafeInteger(targetId) || targetId < 1 || !ROLES.includes(role)) return res.status(422).json({ error: 'Rol o usuario inválido.' });
    if (targetId === req.session.user.id) return res.status(422).json({ error: 'No puedes cambiar tu propio rol.' });
    const result = await withTransaction(async (connection) => {
      const [update] = await connection.execute("UPDATE users SET role = ?, auth_version = auth_version + 1 WHERE id = ? AND role <> 'superuser'", [role, targetId]);
      if (update.affectedRows) await audit(req, 'user_role_changed', 'user', targetId, { role }, { db: connection, required: true });
      return update;
    });
    if (!result.affectedRows) return res.status(404).json({ error: 'Usuario no encontrado o protegido.' });
    await securityAlert('user_role_changed', { actorUserId: req.authUser.id, targetUserId: targetId, role, requestId: req.requestId });
    res.json({ message: 'Rol actualizado.' });
  } catch (error) { next(error); }
});

router.patch('/:id/status', requireCapability(CAPABILITIES.USER_STATUS_CHANGE), verifyCsrf, async (req, res, next) => {
  try {
    const targetId = Number(req.params.id);
    const status = String(req.body.status || '');
    if (!Number.isSafeInteger(targetId) || !['active', 'suspended'].includes(status)) return res.status(422).json({ error: 'Estado o usuario inválido.' });
    if (targetId === req.session.user.id) return res.status(422).json({ error: 'No puedes suspender tu propia cuenta.' });
    const result = await withTransaction(async (connection) => {
      const [update] = await connection.execute("UPDATE users SET status = ?, auth_version = auth_version + 1 WHERE id = ? AND role <> 'superuser'", [status, targetId]);
      if (update.affectedRows) await audit(req, 'user_status_changed', 'user', targetId, { status }, { db: connection, required: true });
      return update;
    });
    if (!result.affectedRows) return res.status(404).json({ error: 'Usuario no encontrado o protegido.' });
    await securityAlert('user_status_changed', { actorUserId: req.authUser.id, targetUserId: targetId, status, requestId: req.requestId });
    res.json({ message: 'Estado actualizado.' });
  } catch (error) { next(error); }
});

router.patch('/:id/password', requireCapability(CAPABILITIES.USER_PASSWORD_RESET), verifyCsrf, async (req, res, next) => {
  try {
    const targetId = Number(req.params.id);
    const temporaryPassword = String(req.body.temporaryPassword || '');
    if (!Number.isSafeInteger(targetId) || targetId < 1) return res.status(422).json({ error: 'Usuario inválido.' });
    if (!validPassword(temporaryPassword)) return res.status(422).json({ error: 'La contraseña temporal no cumple la política de seguridad.' });
    if (targetId === req.authUser.id) return res.status(422).json({ error: 'Utiliza el cambio de contraseña personal para tu propia cuenta.' });

    const hash = await bcrypt.hash(temporaryPassword, 12);
    const result = await withTransaction(async connection => {
      const [update] = await connection.execute(
        `UPDATE users
         SET password_hash=?,must_change_password=TRUE,password_changed_at=UTC_TIMESTAMP(),
             auth_version=auth_version+1,failed_login_attempts=0,locked_until=NULL
         WHERE id=? AND role<>'superuser'`,
        [hash, targetId]
      );
      if (update.affectedRows) {
        await audit(req, 'user_password_reset_by_superuser', 'user', targetId, null, { db: connection, required: true });
      }
      return update;
    });
    if (!result.affectedRows) return res.status(404).json({ error: 'Usuario no encontrado o cuenta protegida.' });
    await securityAlert('user_password_reset_by_superuser', {
      actorUserId: req.authUser.id,
      targetUserId: targetId,
      requestId: req.requestId
    });
    return res.json({ message: 'Contraseña temporal asignada. El usuario deberá cambiarla al iniciar sesión.' });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
