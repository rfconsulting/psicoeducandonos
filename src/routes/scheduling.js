const crypto = require('node:crypto');
const express = require('express');
const pool = require('../config/database');
const { requireApprovedStudent, requireCapability, verifyCsrf } = require('../middleware/security');
const { CAPABILITIES } = require('../constants/access');
const { WEEKDAYS, validTimezone, minutes, slotsForDay, zonedDateTimeToUtc, localDateTime } = require('../services/scheduling');
const withTransaction = require('../services/transaction');
const audit = require('../services/audit');

const router = express.Router();
const text = (value, max) => String(value || '').trim().slice(0, max);

router.get('/services', requireApprovedStudent, async (_req, res, next) => {
  try {
    const [services] = await pool.execute(`SELECT s.id,s.service_type AS serviceType,s.name,s.description,s.duration_minutes AS durationMinutes,
      p.id AS professionalId,p.professional_type AS professionalType,p.specialties,p.bio,p.timezone,u.full_name AS professionalName
      FROM professional_services s JOIN professional_profiles p ON p.id=s.professional_id AND p.status='active'
      JOIN users u ON u.id=p.user_id AND u.status='active' WHERE s.active=TRUE ORDER BY u.full_name,s.name`);
    const serviceIds = services.map(service => service.id);
    let prices = [];
    if (serviceIds.length) {
      const placeholders = serviceIds.map(() => '?').join(',');
      [prices] = await pool.execute(`SELECT p.service_id AS serviceId,pp.id,pp.currency,pp.amount_minor AS amountMinor FROM products p JOIN product_prices pp ON pp.product_id=p.id AND pp.active=TRUE WHERE p.active=TRUE AND p.service_id IN (${placeholders}) ORDER BY pp.currency`, serviceIds);
    }
    services.forEach(service => { service.prices = prices.filter(price => Number(price.serviceId) === Number(service.id)).map(({ serviceId: _serviceId, ...price }) => price); });
    return res.json({ services });
  } catch (error) { return next(error); }
});

router.get('/appointments/my', requireApprovedStudent, async (req, res, next) => {
  try {
    const [appointments] = await pool.execute(`SELECT a.public_id AS reference,a.start_at AS startAt,a.end_at AS endAt,a.timezone,a.status,
      s.name AS serviceName,u.full_name AS professionalName,o.public_id AS orderReference,o.status AS orderStatus
      FROM appointments a JOIN professional_services s ON s.id=a.service_id JOIN professional_profiles p ON p.id=a.professional_id
      JOIN users u ON u.id=p.user_id LEFT JOIN orders o ON o.id=a.order_id WHERE a.client_user_id=? ORDER BY a.start_at DESC LIMIT 100`, [req.authUser.id]);
    return res.json({ appointments });
  } catch (error) { return next(error); }
});

router.get('/services/:serviceId/slots', requireApprovedStudent, async (req, res, next) => {
  try {
    const serviceId = Number(req.params.serviceId); const date = text(req.query.date, 10);
    if (!Number.isSafeInteger(serviceId) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(422).json({ error: 'Servicio o fecha inválida.' });
    const [[service]] = await pool.execute(`SELECT s.id,s.professional_id AS professionalId,s.duration_minutes AS durationMinutes,p.timezone
      FROM professional_services s JOIN professional_profiles p ON p.id=s.professional_id WHERE s.id=? AND s.active=TRUE AND p.status='active' LIMIT 1`, [serviceId]);
    if (!service) return res.status(404).json({ error: 'Servicio no encontrado.' });
    const weekday = WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
    const [rules] = await pool.execute('SELECT start_time AS startTime,end_time AS endTime FROM availability_rules WHERE professional_id=? AND weekday=? AND active=TRUE', [service.professionalId, weekday]);
    const [exceptions] = await pool.execute('SELECT start_time AS startTime,end_time AS endTime,exception_type AS exceptionType FROM availability_exceptions WHERE professional_id=? AND exception_date=?', [service.professionalId, date]);
    const [holds] = await pool.execute('SELECT start_at AS startAt FROM appointment_holds WHERE professional_id=? AND expires_at>UTC_TIMESTAMP()', [service.professionalId]);
    const [appointments] = await pool.execute("SELECT start_at AS startAt FROM appointments WHERE professional_id=? AND status IN ('held','pending_payment','confirmed') AND DATE(start_at) BETWEEN DATE_SUB(?,INTERVAL 1 DAY) AND DATE_ADD(?,INTERVAL 1 DAY)", [service.professionalId, date, date]);
    const occupied = new Set([...holds, ...appointments].map(item => new Date(item.startAt).toISOString()));
    const blocked = exceptions.filter(item => item.exceptionType === 'blocked');
    const candidates = [...rules, ...exceptions.filter(item => item.exceptionType === 'available')].flatMap(rule => slotsForDay({ date, weekday, startTime: String(rule.startTime).slice(0, 5), endTime: String(rule.endTime).slice(0, 5), durationMinutes: service.durationMinutes }));
    const slots = [...new Set(candidates)].map(time => ({ time, startAt: zonedDateTimeToUtc(date, time, service.timezone) })).filter(slot => slot.startAt && slot.startAt > new Date() && !occupied.has(slot.startAt.toISOString()) && !blocked.some(item => { const value = minutes(slot.time); return value >= minutes(String(item.startTime).slice(0, 5)) && value < minutes(String(item.endTime).slice(0, 5)); })).map(slot => ({ time: slot.time, startAt: slot.startAt.toISOString() }));
    return res.json({ timezone: service.timezone, slots });
  } catch (error) { return next(error); }
});

router.post('/services/:serviceId/holds', requireApprovedStudent, verifyCsrf, async (req, res, next) => {
  try {
    const serviceId = Number(req.params.serviceId); const startAt = new Date(req.body.startAt);
    if (!Number.isSafeInteger(serviceId) || Number.isNaN(startAt.getTime()) || startAt <= new Date()) return res.status(422).json({ error: 'Servicio u horario inválido.' });
    const hold = await withTransaction(async connection => {
      const [[service]] = await connection.execute(`SELECT s.professional_id AS professionalId,s.duration_minutes AS durationMinutes,p.timezone
        FROM professional_services s JOIN professional_profiles p ON p.id=s.professional_id WHERE s.id=? AND s.active=TRUE AND p.status='active' LIMIT 1 FOR UPDATE`, [serviceId]);
      if (!service) return null;
      await connection.execute('DELETE FROM appointment_holds WHERE professional_id=? AND expires_at<=UTC_TIMESTAMP()', [service.professionalId]);
      const endAt = new Date(startAt.getTime() + service.durationMinutes * 60000); const id = crypto.randomUUID();
      const local = localDateTime(startAt, service.timezone);
      const [rules] = await connection.execute('SELECT start_time AS startTime,end_time AS endTime FROM availability_rules WHERE professional_id=? AND weekday=? AND active=TRUE', [service.professionalId, local.weekday]);
      const [exceptions] = await connection.execute('SELECT start_time AS startTime,end_time AS endTime,exception_type AS exceptionType FROM availability_exceptions WHERE professional_id=? AND exception_date=?', [service.professionalId, local.date]);
      const candidate = minutes(local.time); const durationEnd = candidate + service.durationMinutes;
      const within = [...rules, ...exceptions.filter(item => item.exceptionType === 'available')].some(rule => candidate >= minutes(String(rule.startTime).slice(0, 5)) && durationEnd <= minutes(String(rule.endTime).slice(0, 5)));
      const blocked = exceptions.some(item => item.exceptionType === 'blocked' && candidate < minutes(String(item.endTime).slice(0, 5)) && durationEnd > minutes(String(item.startTime).slice(0, 5)));
      if (!within || blocked) return { unavailable: true };
      const [[collision]] = await connection.execute(`SELECT 1 FROM appointment_holds WHERE professional_id=? AND start_at<? AND end_at>? AND expires_at>UTC_TIMESTAMP()
        UNION ALL SELECT 1 FROM appointments WHERE professional_id=? AND start_at<? AND end_at>? AND status IN ('held','pending_payment','confirmed') LIMIT 1`, [service.professionalId, endAt, startAt, service.professionalId, endAt, startAt]);
      if (collision) return { unavailable: true };
      await connection.execute('INSERT INTO appointment_holds (id,professional_id,service_id,client_user_id,start_at,end_at,expires_at) VALUES (?,?,?,?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 10 MINUTE))', [id, service.professionalId, serviceId, req.authUser.id, startAt, endAt]);
      await audit(req, 'appointment_hold_created', 'appointment_hold', null, { serviceId, startAt: startAt.toISOString() }, { db: connection, required: true });
      return { id, expiresInSeconds: 600 };
    });
    if (!hold) return res.status(404).json({ error: 'Servicio no encontrado.' });
    if (hold.unavailable) return res.status(409).json({ error: 'Ese horario no está disponible.' });
    return res.status(201).json({ hold });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ese horario acaba de ser reservado. Elige otro.' });
    return next(error);
  }
});

router.post('/professionals', requireCapability(CAPABILITIES.SCHEDULING_MANAGE), verifyCsrf, async (req, res, next) => {
  try {
    const userId = Number(req.body.userId); const professionalType = req.body.professionalType; const timezone = text(req.body.timezone, 64);
    if (!Number.isSafeInteger(userId) || !['psychologist','counselor'].includes(professionalType) || !validTimezone(timezone)) return res.status(422).json({ error: 'Datos profesionales inválidos.' });
    const [result] = await pool.execute(`INSERT INTO professional_profiles (user_id,professional_type,license_number,specialties,bio,timezone,status)
      VALUES (?,?,?,?,?,?,'active') ON DUPLICATE KEY UPDATE professional_type=VALUES(professional_type),license_number=VALUES(license_number),specialties=VALUES(specialties),bio=VALUES(bio),timezone=VALUES(timezone),status='active'`, [userId, professionalType, text(req.body.licenseNumber, 80) || null, text(req.body.specialties, 500) || null, text(req.body.bio, 5000) || null, timezone]);
    return res.status(201).json({ message: 'Perfil profesional habilitado.', id: result.insertId || null });
  } catch (error) { return next(error); }
});

router.post('/professionals/:professionalId/services', requireCapability(CAPABILITIES.SCHEDULING_MANAGE), verifyCsrf, async (req, res, next) => {
  try {
    const professionalId = Number(req.params.professionalId); const duration = Number(req.body.durationMinutes); const name = text(req.body.name, 180); const description = text(req.body.description, 10000);
    if (!Number.isSafeInteger(professionalId) || !['psychology','counseling'].includes(req.body.serviceType) || !Number.isInteger(duration) || duration < 15 || duration > 240 || name.length < 5 || description.length < 20) return res.status(422).json({ error: 'Datos del servicio inválidos.' });
    const [result] = await pool.execute('INSERT INTO professional_services (professional_id,service_type,name,description,duration_minutes) VALUES (?,?,?,?,?)', [professionalId, req.body.serviceType, name, description, duration]);
    return res.status(201).json({ message: 'Servicio creado.', id: result.insertId });
  } catch (error) { return next(error); }
});

router.post('/professionals/:professionalId/availability', requireCapability(CAPABILITIES.SCHEDULING_MANAGE), verifyCsrf, async (req, res, next) => {
  try {
    const professionalId = Number(req.params.professionalId); const start = text(req.body.startTime, 5); const end = text(req.body.endTime, 5);
    if (!Number.isSafeInteger(professionalId) || !WEEKDAYS.includes(req.body.weekday) || minutes(start) === null || minutes(end) === null || minutes(end) <= minutes(start)) return res.status(422).json({ error: 'Disponibilidad inválida.' });
    const [result] = await pool.execute('INSERT INTO availability_rules (professional_id,weekday,start_time,end_time) VALUES (?,?,?,?)', [professionalId, req.body.weekday, start, end]);
    return res.status(201).json({ message: 'Disponibilidad creada.', id: result.insertId });
  } catch (error) { return next(error); }
});

module.exports = router;
