const crypto = require('node:crypto');
const express = require('express');
const pool = require('../config/database');
const { requireAuth, requireRole, requireCapability, verifyCsrf } = require('../middleware/security');
const { CAPABILITIES, hasCapability } = require('../constants/access');
const { MAX_PHOTO_BYTES, photoMime } = require('../validation/professional-photo');
const { WEEKDAYS, validProfessionalType, validServiceType, professionalCanOffer, validTimezone, minutes, slotsForDay, conflictsWithConsultation, zonedDateTimeToUtc, localDateTime } = require('../services/scheduling');
const withTransaction = require('../services/transaction');
const audit = require('../services/audit');

const router = express.Router();
const text = (value, max) => String(value || '').trim().slice(0, max);

router.get('/professionals/public', async (_req, res, next) => {
  try {
    const [rows] = await pool.execute(`SELECT p.id,p.professional_type AS professionalType,p.specialties,p.bio,
      (p.photo_data IS NOT NULL) AS hasPhoto,p.updated_at AS photoUpdatedAt,u.full_name AS fullName,
      s.id AS serviceId,s.name AS serviceName,s.duration_minutes AS durationMinutes,
      pp.currency,pp.amount_minor AS amountMinor
      FROM professional_profiles p JOIN users u ON u.id=p.user_id AND u.status='active'
      JOIN professional_services s ON s.professional_id=p.id AND s.active=TRUE
      JOIN products product ON product.service_id=s.id AND product.active=TRUE
      JOIN product_prices pp ON pp.product_id=product.id AND pp.active=TRUE
      WHERE p.status='active' AND p.credential_status='verified'
      ORDER BY u.full_name,s.name,pp.currency`);
    const profiles = new Map();
    rows.forEach(row => {
      if (!profiles.has(row.id)) profiles.set(row.id, { id: row.id, fullName: row.fullName, professionalType: row.professionalType,
        specialties: row.specialties, bio: row.bio, hasPhoto: Boolean(row.hasPhoto), photoUpdatedAt: row.photoUpdatedAt, services: [] });
      const profile = profiles.get(row.id);
      let service = profile.services.find(item => item.id === row.serviceId);
      if (!service) { service = { id: row.serviceId, name: row.serviceName, durationMinutes: row.durationMinutes, prices: [] }; profile.services.push(service); }
      service.prices.push({ currency: row.currency, amountMinor: row.amountMinor });
    });
    return res.json({ professionals: [...profiles.values()] });
  } catch (error) { return next(error); }
});

router.get('/professionals/:professionalId/public-photo', async (req, res, next) => {
  try {
    const id = Number(req.params.professionalId);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(404).end();
    const [[profile]] = await pool.execute(`SELECT p.photo_mime AS photoMime,p.photo_data AS photoData FROM professional_profiles p
      JOIN users u ON u.id=p.user_id AND u.status='active'
      WHERE p.id=? AND p.status='active' AND p.credential_status='verified' LIMIT 1`, [id]);
    if (!profile?.photoData) return res.status(404).end();
    res.set('Content-Type', profile.photoMime);
    res.set('Cache-Control', 'public, max-age=300');
    return res.end(profile.photoData);
  } catch (error) { return next(error); }
});

router.get('/services', requireRole('student'), async (_req, res, next) => {
  try {
    const [services] = await pool.execute(`SELECT s.id,s.service_type AS serviceType,s.name,s.description,s.duration_minutes AS durationMinutes,
      p.id AS professionalId,p.professional_type AS professionalType,p.specialties,p.bio,p.timezone,
      (p.photo_data IS NOT NULL) AS hasPhoto,p.updated_at AS photoUpdatedAt,u.full_name AS professionalName
      FROM professional_services s JOIN professional_profiles p ON p.id=s.professional_id AND p.status='active' AND p.credential_status='verified'
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

router.get('/appointments/my', requireRole('student'), async (req, res, next) => {
  try {
    const [appointments] = await pool.execute(`SELECT a.public_id AS reference,a.start_at AS startAt,a.end_at AS endAt,a.timezone,a.status,
      s.name AS serviceName,u.full_name AS professionalName,o.public_id AS orderReference,o.status AS orderStatus
      FROM appointments a JOIN professional_services s ON s.id=a.service_id JOIN professional_profiles p ON p.id=a.professional_id
      JOIN users u ON u.id=p.user_id LEFT JOIN orders o ON o.id=a.order_id WHERE a.client_user_id=? ORDER BY a.start_at DESC LIMIT 100`, [req.authUser.id]);
    return res.json({ appointments });
  } catch (error) { return next(error); }
});

router.get('/services/:serviceId/slots', requireRole('student'), async (req, res, next) => {
  try {
    const serviceId = Number(req.params.serviceId); const date = text(req.query.date, 10);
    if (!Number.isSafeInteger(serviceId) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(422).json({ error: 'Servicio o fecha inválida.' });
    const [[service]] = await pool.execute(`SELECT s.id,s.professional_id AS professionalId,s.duration_minutes AS durationMinutes,p.timezone
      FROM professional_services s JOIN professional_profiles p ON p.id=s.professional_id WHERE s.id=? AND s.active=TRUE AND p.status='active' AND p.credential_status='verified' LIMIT 1`, [serviceId]);
    if (!service) return res.status(404).json({ error: 'Servicio no encontrado.' });
    const weekday = WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
    const [rules] = await pool.execute('SELECT start_time AS startTime,end_time AS endTime FROM availability_rules WHERE professional_id=? AND weekday=? AND active=TRUE', [service.professionalId, weekday]);
    const [exceptions] = await pool.execute('SELECT start_time AS startTime,end_time AS endTime,exception_type AS exceptionType FROM availability_exceptions WHERE professional_id=? AND exception_date=?', [service.professionalId, date]);
    const [holds] = await pool.execute('SELECT start_at AS startAt,end_at AS endAt FROM appointment_holds WHERE professional_id=? AND expires_at>UTC_TIMESTAMP()', [service.professionalId]);
    const [appointments] = await pool.execute("SELECT start_at AS startAt,end_at AS endAt FROM appointments WHERE professional_id=? AND status IN ('held','pending_payment','confirmed') AND DATE(start_at) BETWEEN DATE_SUB(?,INTERVAL 1 DAY) AND DATE_ADD(?,INTERVAL 1 DAY)", [service.professionalId, date, date]);
    const occupied = [...holds, ...appointments].map(item => ({ start: new Date(item.startAt), end: new Date(item.endAt) }));
    const blocked = exceptions.filter(item => item.exceptionType === 'blocked');
    const candidates = [...rules, ...exceptions.filter(item => item.exceptionType === 'available')].flatMap(rule => slotsForDay({ date, weekday, startTime: String(rule.startTime).slice(0, 5), endTime: String(rule.endTime).slice(0, 5), durationMinutes: service.durationMinutes }));
    const slots = [...new Set(candidates)].map(time => ({ time, startAt: zonedDateTimeToUtc(date, time, service.timezone) })).filter(slot => {
      if (!slot.startAt || slot.startAt <= new Date()) return false;
      const endAt = new Date(slot.startAt.getTime() + service.durationMinutes * 60000);
      return !occupied.some(item => conflictsWithConsultation(slot.startAt, endAt, item.start, item.end)) &&
        !blocked.some(item => { const value = minutes(slot.time); return value >= minutes(String(item.startTime).slice(0, 5)) && value < minutes(String(item.endTime).slice(0, 5)); });
    }).map(slot => ({ time: slot.time, startAt: slot.startAt.toISOString() }));
    return res.json({ timezone: service.timezone, slots });
  } catch (error) { return next(error); }
});

router.post('/services/:serviceId/holds', requireRole('student'), verifyCsrf, async (req, res, next) => {
  try {
    const serviceId = Number(req.params.serviceId); const startAt = new Date(req.body.startAt);
    if (!Number.isSafeInteger(serviceId) || Number.isNaN(startAt.getTime()) || startAt <= new Date()) return res.status(422).json({ error: 'Servicio u horario inválido.' });
    const hold = await withTransaction(async connection => {
      const [[service]] = await connection.execute(`SELECT s.professional_id AS professionalId,s.duration_minutes AS durationMinutes,p.timezone
        FROM professional_services s JOIN professional_profiles p ON p.id=s.professional_id WHERE s.id=? AND s.active=TRUE AND p.status='active' AND p.credential_status='verified' LIMIT 1 FOR UPDATE`, [serviceId]);
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
      const [[collision]] = await connection.execute(`SELECT 1 FROM appointment_holds WHERE professional_id=? AND start_at<DATE_ADD(?,INTERVAL 10 MINUTE) AND end_at>DATE_SUB(?,INTERVAL 10 MINUTE) AND expires_at>UTC_TIMESTAMP()
        UNION ALL SELECT 1 FROM appointments WHERE professional_id=? AND start_at<DATE_ADD(?,INTERVAL 10 MINUTE) AND end_at>DATE_SUB(?,INTERVAL 10 MINUTE) AND status IN ('held','pending_payment','confirmed') LIMIT 1`, [service.professionalId, endAt, startAt, service.professionalId, endAt, startAt]);
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

router.get('/professionals', requireCapability(CAPABILITIES.SCHEDULING_MANAGE), async (_req, res, next) => {
  try {
    const [professionals] = await pool.execute(`SELECT p.id,p.user_id AS userId,u.full_name AS fullName,u.email,u.status AS userStatus,
      p.professional_type AS professionalType,p.license_number AS licenseNumber,p.specialties,p.bio,p.timezone,p.status,
      (p.photo_data IS NOT NULL) AS hasPhoto,p.updated_at AS photoUpdatedAt,
      p.credential_status AS credentialStatus,p.verification_notes AS verificationNotes,p.verified_at AS verifiedAt,
      verifier.full_name AS verifiedByName
      FROM professional_profiles p JOIN users u ON u.id=p.user_id LEFT JOIN users verifier ON verifier.id=p.verified_by
      ORDER BY FIELD(p.credential_status,'pending','rejected','verified'),u.full_name`);
    const [candidates] = await pool.execute(`SELECT u.id,u.full_name AS fullName,u.email,u.role FROM users u
      LEFT JOIN professional_profiles p ON p.user_id=u.id WHERE u.status='active' AND (p.id IS NULL OR p.credential_status IN ('pending','rejected')) ORDER BY u.full_name LIMIT 500`);
    const ids = professionals.map(item => item.id);
    let services = []; let availability = [];
    if (ids.length) {
      const placeholders = ids.map(() => '?').join(',');
      [services] = await pool.execute(`SELECT id,professional_id AS professionalId,service_type AS serviceType,name,description,duration_minutes AS durationMinutes,active
        FROM professional_services WHERE professional_id IN (${placeholders}) ORDER BY name`, ids);
      [availability] = await pool.execute(`SELECT id,professional_id AS professionalId,weekday,start_time AS startTime,end_time AS endTime,active
        FROM availability_rules WHERE professional_id IN (${placeholders}) ORDER BY FIELD(weekday,'mon','tue','wed','thu','fri','sat','sun'),start_time`, ids);
      const serviceIds = services.map(item => item.id);
      if (serviceIds.length) {
        const servicePlaceholders = serviceIds.map(() => '?').join(',');
        const [prices] = await pool.execute(`SELECT p.service_id AS serviceId,pp.currency,pp.amount_minor AS amountMinor
          FROM products p JOIN product_prices pp ON pp.product_id=p.id AND pp.active=TRUE
          WHERE p.service_id IN (${servicePlaceholders}) ORDER BY pp.currency`, serviceIds);
        services.forEach(service => { service.prices = prices.filter(price => Number(price.serviceId) === Number(service.id)).map(({ serviceId: _id, ...price }) => price); });
      }
    }
    professionals.forEach(item => {
      item.services = services.filter(service => Number(service.professionalId) === Number(item.id)).map(service => ({ ...service, active: Boolean(service.active) }));
      item.availability = availability.filter(rule => Number(rule.professionalId) === Number(item.id)).map(rule => ({ ...rule, active: Boolean(rule.active) }));
    });
    return res.json({ professionals, candidates });
  } catch (error) { return next(error); }
});

router.get('/professionals/:professionalId/photo', requireAuth, async (req, res, next) => {
  try {
    const professionalId = Number(req.params.professionalId);
    if (!Number.isSafeInteger(professionalId) || professionalId < 1) return res.status(404).end();
    const [[profile]] = await pool.execute('SELECT status,credential_status AS credentialStatus,photo_mime AS photoMime,photo_data AS photoData FROM professional_profiles WHERE id=? LIMIT 1', [professionalId]);
    if (!profile?.photoData || (profile.status !== 'active' || profile.credentialStatus !== 'verified') && !hasCapability(req.authUser.role, CAPABILITIES.SCHEDULING_MANAGE)) return res.status(404).end();
    res.set('Content-Type', profile.photoMime);
    res.set('Cache-Control', 'private, max-age=300');
    res.set('Vary', 'Cookie');
    return res.end(profile.photoData);
  } catch (error) { return next(error); }
});

router.post('/professionals/:professionalId/photo', requireCapability(CAPABILITIES.SCHEDULING_MANAGE), verifyCsrf,
  express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: MAX_PHOTO_BYTES }), async (req, res, next) => {
    try {
      const professionalId = Number(req.params.professionalId);
      const mime = photoMime(req.body);
      if (!Number.isSafeInteger(professionalId) || professionalId < 1 || !mime || req.get('content-type')?.split(';')[0] !== mime) return res.status(422).json({ error: 'Selecciona una foto JPG, PNG o WebP de hasta 2 MB.' });
      const updated = await withTransaction(async connection => {
        const [result] = await connection.execute('UPDATE professional_profiles SET photo_mime=?,photo_data=? WHERE id=?', [mime, req.body, professionalId]);
        if (!result.affectedRows) return false;
        await audit(req, 'professional_photo_updated', 'professional_profile', professionalId, null, { db: connection, required: true });
        return true;
      });
      if (!updated) return res.status(404).json({ error: 'Perfil profesional no encontrado.' });
      return res.json({ message: 'Foto de perfil actualizada.' });
    } catch (error) { return next(error); }
  });

router.post('/professionals', requireCapability(CAPABILITIES.SCHEDULING_MANAGE), verifyCsrf, async (req, res, next) => {
  try {
    const userId = Number(req.body.userId); const professionalType = req.body.professionalType; const timezone = text(req.body.timezone, 64);
    const licenseNumber = text(req.body.licenseNumber, 80);
    const requiresLicense = ['psychologist', 'psychiatrist'].includes(professionalType);
    if (!Number.isSafeInteger(userId) || userId < 1) return res.status(422).json({ error: 'Selecciona un usuario válido.' });
    if (!validProfessionalType(professionalType)) return res.status(422).json({ error: 'Selecciona una clasificación profesional válida.' });
    if (!validTimezone(timezone)) return res.status(422).json({ error: 'Zona horaria inválida. Usa un identificador completo como America/Argentina/Buenos_Aires.' });
    if (requiresLicense && licenseNumber.length < 3) return res.status(422).json({ error: 'Indica una matrícula o licencia de al menos 3 caracteres.' });
    const id = await withTransaction(async connection => {
      const [[user]] = await connection.execute("SELECT id FROM users WHERE id=? AND status='active' LIMIT 1 FOR UPDATE", [userId]);
      if (!user) return null;
      await connection.execute(`INSERT INTO professional_profiles (user_id,professional_type,license_number,specialties,bio,timezone,status,credential_status)
        VALUES (?,?,?,?,?,?,'draft','pending') ON DUPLICATE KEY UPDATE professional_type=VALUES(professional_type),license_number=VALUES(license_number),
        specialties=VALUES(specialties),bio=VALUES(bio),timezone=VALUES(timezone),status='draft',credential_status='pending',verification_notes=NULL,verified_by=NULL,verified_at=NULL`,
      [userId, professionalType, licenseNumber || null, text(req.body.specialties, 500) || null, text(req.body.bio, 5000) || null, timezone]);
      const [[profile]] = await connection.execute('SELECT id FROM professional_profiles WHERE user_id=?', [userId]);
      await audit(req, 'professional_profile_submitted', 'professional_profile', profile.id, { professionalType }, { db: connection, required: true });
      return profile.id;
    });
    if (!id) return res.status(404).json({ error: 'Usuario activo no encontrado.' });
    return res.status(201).json({ message: 'Perfil profesional enviado a validación.', id });
  } catch (error) { return next(error); }
});

router.patch('/professionals/:professionalId', requireCapability(CAPABILITIES.SCHEDULING_MANAGE), verifyCsrf, async (req, res, next) => {
  try {
    const id = Number(req.params.professionalId); const professionalType = req.body.professionalType;
    const licenseNumber = text(req.body.licenseNumber, 80); const timezone = text(req.body.timezone, 64);
    if (!Number.isSafeInteger(id) || id < 1 || !validProfessionalType(professionalType) || !validTimezone(timezone) ||
      (['psychologist', 'psychiatrist'].includes(professionalType) && licenseNumber.length < 3)) return res.status(422).json({ error: 'Revisa la clasificación, matrícula y zona horaria.' });
    const updated = await withTransaction(async connection => {
      const [[profile]] = await connection.execute('SELECT id,professional_type AS professionalType,credential_status AS credentialStatus FROM professional_profiles WHERE id=? LIMIT 1 FOR UPDATE', [id]);
      if (!profile) return false;
      const typeChanged = profile.professionalType !== professionalType;
      const [services] = typeChanged ? await connection.execute('SELECT id FROM professional_services WHERE professional_id=? AND active=TRUE LIMIT 1', [id]) : [[]];
      if (services.length) return 'services';
      await connection.execute(`UPDATE professional_profiles SET professional_type=?,license_number=?,specialties=?,bio=?,timezone=?,
        credential_status=IF(?,'pending',credential_status),status=IF(?,'draft',status),
        verification_notes=IF(?,NULL,verification_notes),verified_by=IF(?,NULL,verified_by),verified_at=IF(?,NULL,verified_at)
        WHERE id=?`, [professionalType, licenseNumber || null, text(req.body.specialties, 500) || null, text(req.body.bio, 5000) || null, timezone,
          typeChanged, typeChanged, typeChanged, typeChanged, typeChanged, id]);
      await audit(req, 'professional_profile_updated', 'professional_profile', id, { professionalType, typeChanged }, { db: connection, required: true });
      return true;
    });
    if (!updated) return res.status(404).json({ error: 'Perfil profesional no encontrado.' });
    if (updated === 'services') return res.status(409).json({ error: 'No se puede cambiar la clasificación mientras haya servicios activos.' });
    return res.json({ message: 'Perfil profesional actualizado. Un cambio de clasificación requiere nueva validación.' });
  } catch (error) { return next(error); }
});

router.patch('/professionals/:professionalId/credentials', requireCapability(CAPABILITIES.SCHEDULING_MANAGE), verifyCsrf, async (req, res, next) => {
  try {
    const professionalId = Number(req.params.professionalId); const decision = String(req.body.decision || ''); const notes = text(req.body.notes, 2000);
    if (!Number.isSafeInteger(professionalId) || !['verify','reject','suspend','reactivate'].includes(decision) || notes.length < 5) return res.status(422).json({ error: 'Decisión y fundamento requeridos.' });
    const updated = await withTransaction(async connection => {
      const [[profile]] = await connection.execute('SELECT id,credential_status AS credentialStatus,status FROM professional_profiles WHERE id=? LIMIT 1 FOR UPDATE', [professionalId]);
      if (!profile) return false;
      if (decision === 'verify' && !['pending','rejected'].includes(profile.credentialStatus)) return false;
      if (decision === 'suspend' && profile.status !== 'active') return false;
      if (decision === 'reactivate' && (profile.credentialStatus !== 'verified' || profile.status !== 'suspended')) return false;
      if (decision === 'verify') await connection.execute("UPDATE professional_profiles SET credential_status='verified',status='active',verification_notes=?,verified_by=?,verified_at=UTC_TIMESTAMP() WHERE id=?", [notes, req.authUser.id, professionalId]);
      if (decision === 'reject') await connection.execute("UPDATE professional_profiles SET credential_status='rejected',status='draft',verification_notes=?,verified_by=?,verified_at=UTC_TIMESTAMP() WHERE id=?", [notes, req.authUser.id, professionalId]);
      if (decision === 'suspend') await connection.execute("UPDATE professional_profiles SET status='suspended',verification_notes=? WHERE id=?", [notes, professionalId]);
      if (decision === 'reactivate') await connection.execute("UPDATE professional_profiles SET status='active',verification_notes=? WHERE id=?", [notes, professionalId]);
      await audit(req, `professional_credentials_${decision}`, 'professional_profile', professionalId, { notes }, { db: connection, required: true });
      return true;
    });
    if (!updated) return res.status(409).json({ error: 'Perfil inexistente o transición no permitida.' });
    return res.json({ message: 'Estado profesional actualizado.' });
  } catch (error) { return next(error); }
});

router.post('/professionals/:professionalId/services', requireCapability(CAPABILITIES.SCHEDULING_MANAGE), verifyCsrf, async (req, res, next) => {
  try {
    const professionalId = Number(req.params.professionalId); const duration = Number(req.body.durationMinutes); const name = text(req.body.name, 180); const description = text(req.body.description, 10000);
    if (!Number.isSafeInteger(professionalId) || !validServiceType(req.body.serviceType) || !Number.isInteger(duration) || duration < 15 || duration > 240 || name.length < 5 || description.length < 20) return res.status(422).json({ error: 'Datos del servicio inválidos.' });
    const [[professional]] = await pool.execute("SELECT professional_type AS professionalType FROM professional_profiles WHERE id=? AND status='active' AND credential_status='verified' LIMIT 1", [professionalId]);
    if (!professional) return res.status(404).json({ error: 'Profesional no encontrado.' });
    if (!professionalCanOffer(professional.professionalType, req.body.serviceType)) return res.status(422).json({ error: 'El servicio no corresponde al tipo de profesional.' });
    const [result] = await pool.execute('INSERT INTO professional_services (professional_id,service_type,name,description,duration_minutes) VALUES (?,?,?,?,?)', [professionalId, req.body.serviceType, name, description, duration]);
    return res.status(201).json({ message: 'Servicio creado.', id: result.insertId });
  } catch (error) { return next(error); }
});

router.patch('/professionals/:professionalId/services/:serviceId', requireCapability(CAPABILITIES.SCHEDULING_MANAGE), verifyCsrf, async (req, res, next) => {
  try {
    const professionalId = Number(req.params.professionalId); const serviceId = Number(req.params.serviceId);
    const name = text(req.body.name, 180); const description = text(req.body.description, 10000); const duration = Number(req.body.durationMinutes);
    if (!Number.isSafeInteger(professionalId) || !Number.isSafeInteger(serviceId) || name.length < 5 || description.length < 20 || !Number.isInteger(duration) || duration < 15 || duration > 240) return res.status(422).json({ error: 'Revisa el nombre, la descripción y la duración del servicio.' });
    const updated = await withTransaction(async connection => {
      const [result] = await connection.execute('UPDATE professional_services SET name=?,description=?,duration_minutes=? WHERE id=? AND professional_id=?', [name, description, duration, serviceId, professionalId]);
      if (!result.affectedRows) return false;
      await connection.execute('UPDATE products SET name=? WHERE service_id=?', [name, serviceId]);
      await audit(req, 'professional_service_updated', 'professional_service', serviceId, { professionalId, duration }, { db: connection, required: true });
      return true;
    });
    if (!updated) return res.status(404).json({ error: 'Servicio no encontrado para este profesional.' });
    return res.json({ message: 'Servicio actualizado.' });
  } catch (error) { return next(error); }
});

router.patch('/professionals/:professionalId/services/:serviceId/status', requireCapability(CAPABILITIES.SCHEDULING_MANAGE), verifyCsrf, async (req, res, next) => {
  try {
    const professionalId = Number(req.params.professionalId); const serviceId = Number(req.params.serviceId);
    if (!Number.isSafeInteger(professionalId) || professionalId < 1 || !Number.isSafeInteger(serviceId) || serviceId < 1 || typeof req.body.active !== 'boolean') return res.status(422).json({ error: 'Estado del servicio inválido.' });
    const result = await withTransaction(async connection => {
      const [[service]] = await connection.execute(`SELECT s.id,s.active,s.service_type AS serviceType,p.professional_type AS professionalType,
        p.status AS professionalStatus,p.credential_status AS credentialStatus
        FROM professional_services s JOIN professional_profiles p ON p.id=s.professional_id
        WHERE s.id=? AND s.professional_id=? LIMIT 1 FOR UPDATE`, [serviceId, professionalId]);
      if (!service) return 'missing';
      if (req.body.active && (service.professionalStatus !== 'active' || service.credentialStatus !== 'verified' || !professionalCanOffer(service.professionalType, service.serviceType))) return 'unavailable';
      if (Boolean(service.active) === req.body.active) return 'unchanged';
      await connection.execute('UPDATE professional_services SET active=? WHERE id=?', [req.body.active, serviceId]);
      await audit(req, req.body.active ? 'professional_service_enabled' : 'professional_service_disabled', 'professional_service', serviceId, { professionalId }, { db: connection, required: true });
      return 'updated';
    });
    if (result === 'missing') return res.status(404).json({ error: 'Servicio no encontrado para este profesional.' });
    if (result === 'unavailable') return res.status(409).json({ error: 'El profesional debe estar verificado y habilitado para activar este servicio.' });
    return res.json({ message: req.body.active ? 'Servicio habilitado.' : 'Servicio inhabilitado.' });
  } catch (error) { return next(error); }
});

router.patch('/professionals/:professionalId/availability/:ruleId', requireCapability(CAPABILITIES.SCHEDULING_MANAGE), verifyCsrf, async (req, res, next) => {
  try {
    const professionalId = Number(req.params.professionalId); const ruleId = Number(req.params.ruleId);
    const start = text(req.body.startTime, 5); const end = text(req.body.endTime, 5);
    if (!Number.isSafeInteger(professionalId) || !Number.isSafeInteger(ruleId) || !WEEKDAYS.includes(req.body.weekday) || minutes(start) === null || minutes(end) === null) return res.status(422).json({ error: 'Selecciona un día y horas válidas.' });
    if (minutes(end) <= minutes(start)) return res.status(422).json({ error: 'La hora de fin debe ser posterior a la de inicio en el mismo día.' });
    const updated = await withTransaction(async connection => {
      const [result] = await connection.execute('UPDATE availability_rules SET weekday=?,start_time=?,end_time=? WHERE id=? AND professional_id=?', [req.body.weekday, start, end, ruleId, professionalId]);
      if (!result.affectedRows) return false;
      await audit(req, 'professional_availability_updated', 'availability_rule', ruleId, { professionalId, weekday: req.body.weekday, start, end }, { db: connection, required: true });
      return true;
    });
    if (!updated) return res.status(404).json({ error: 'Horario no encontrado para este profesional.' });
    return res.json({ message: 'Horario actualizado.' });
  } catch (error) { return next(error); }
});

router.post('/professionals/:professionalId/availability', requireCapability(CAPABILITIES.SCHEDULING_MANAGE), verifyCsrf, async (req, res, next) => {
  try {
    const professionalId = Number(req.params.professionalId); const start = text(req.body.startTime, 5); const end = text(req.body.endTime, 5);
    if (!Number.isSafeInteger(professionalId) || !WEEKDAYS.includes(req.body.weekday) || minutes(start) === null || minutes(end) === null) return res.status(422).json({ error: 'Selecciona un día y horas válidas.' });
    if (minutes(end) <= minutes(start)) return res.status(422).json({ error: 'La hora de fin debe ser posterior a la de inicio en el mismo día.' });
    const [[professional]] = await pool.execute("SELECT id FROM professional_profiles WHERE id=? AND status='active' AND credential_status='verified' LIMIT 1", [professionalId]);
    if (!professional) return res.status(404).json({ error: 'Profesional verificado no encontrado.' });
    const [result] = await pool.execute('INSERT INTO availability_rules (professional_id,weekday,start_time,end_time) VALUES (?,?,?,?)', [professionalId, req.body.weekday, start, end]);
    return res.status(201).json({ message: 'Disponibilidad creada.', id: result.insertId });
  } catch (error) { return next(error); }
});

module.exports = router;
