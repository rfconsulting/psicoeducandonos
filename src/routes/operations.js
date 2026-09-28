const crypto = require('node:crypto');
const express = require('express');
const pool = require('../config/database');
const { requireAuth, requireRole, requireApprovedStudent, requireCapability, verifyCsrf } = require('../middleware/security');
const { CAPABILITIES } = require('../constants/access');
const withTransaction = require('../services/transaction');
const audit = require('../services/audit');
const { createNotification, emailNotification } = require('../services/notifications');
const { validTimezone } = require('../services/scheduling');

const router = express.Router();
const text = (value, max) => String(value || '').trim().slice(0, max);
const SERVICE_CODE = /^[a-z][a-z0-9_]{1,63}$/;
const detectReceiptMime = buffer => {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  return null;
};

router.get('/notifications', requireAuth, async (req, res, next) => {
  try {
    const [notifications] = await pool.execute(`SELECT id,type,title,message,action_url AS actionUrl,read_at AS readAt,created_at AS createdAt
      FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100`, [req.authUser.id]);
    return res.json({ notifications });
  } catch (error) { return next(error); }
});

router.patch('/notifications/:id/read', requireAuth, verifyCsrf, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(422).json({ error: 'Notificación inválida.' });
    await pool.execute('UPDATE notifications SET read_at=COALESCE(read_at,UTC_TIMESTAMP()) WHERE id=? AND user_id=?', [id, req.authUser.id]);
    return res.json({ message: 'Notificación leída.' });
  } catch (error) { return next(error); }
});

router.get('/service-types', requireAuth, async (_req, res, next) => {
  try {
    const [serviceTypes] = await pool.execute(`SELECT code,name,care_domain AS careDomain,schedulable FROM service_type_catalog
      WHERE active=TRUE ORDER BY sort_order`);
    return res.json({ serviceTypes: serviceTypes.map(item => ({ ...item, schedulable: Boolean(item.schedulable) })) });
  } catch (error) { return next(error); }
});

router.get('/professionals/:professionalId/authorizations', requireCapability(CAPABILITIES.SCHEDULING_MANAGE), async (req, res, next) => {
  try {
    const professionalId = Number(req.params.professionalId);
    if (!Number.isSafeInteger(professionalId) || professionalId < 1) return res.status(422).json({ error: 'Profesional inválido.' });
    const [rows] = await pool.execute('SELECT service_type_code AS serviceType FROM professional_service_authorizations WHERE professional_id=?', [professionalId]);
    return res.json({ serviceTypes: rows.map(row => row.serviceType) });
  } catch (error) { return next(error); }
});

router.put('/professionals/:professionalId/authorizations', requireCapability(CAPABILITIES.SCHEDULING_MANAGE), verifyCsrf, async (req, res, next) => {
  try {
    const professionalId = Number(req.params.professionalId);
    const requested = [...new Set(Array.isArray(req.body.serviceTypes) ? req.body.serviceTypes.map(value => String(value)) : [])];
    if (!Number.isSafeInteger(professionalId) || professionalId < 1 || requested.some(value => !SERVICE_CODE.test(value))) return res.status(422).json({ error: 'Habilitaciones inválidas.' });
    const result = await withTransaction(async connection => {
      const [[professional]] = await connection.execute('SELECT id FROM professional_profiles WHERE id=? LIMIT 1 FOR UPDATE', [professionalId]);
      if (!professional) return false;
      if (requested.length) {
        const placeholders = requested.map(() => '?').join(',');
        const [valid] = await connection.execute(`SELECT code FROM service_type_catalog WHERE active=TRUE AND code IN (${placeholders})`, requested);
        if (valid.length !== requested.length) return 'invalid';
      }
      await connection.execute('DELETE FROM professional_service_authorizations WHERE professional_id=?', [professionalId]);
      for (const code of requested) await connection.execute('INSERT INTO professional_service_authorizations (professional_id,service_type_code,authorized_by) VALUES (?,?,?)', [professionalId, code, req.authUser.id]);
      await connection.execute(`UPDATE professional_services s SET active=EXISTS(
        SELECT 1 FROM professional_service_authorizations a WHERE a.professional_id=s.professional_id AND a.service_type_code=s.service_type
      ) WHERE s.professional_id=?`, [professionalId]);
      await audit(req, 'professional_service_authorizations_updated', 'professional_profile', professionalId, { serviceTypes: requested }, { db: connection, required: true });
      return true;
    });
    if (!result) return res.status(404).json({ error: 'Profesional no encontrado.' });
    if (result === 'invalid') return res.status(422).json({ error: 'Uno de los servicios no pertenece al catálogo activo.' });
    return res.json({ message: 'Habilitaciones guardadas.' });
  } catch (error) { return next(error); }
});

router.post('/service-requests', requireRole('student'), verifyCsrf, async (req, res, next) => {
  try {
    const serviceType = text(req.body.serviceType, 64); const deliveryMode = String(req.body.deliveryMode || '');
    const participantFormat = String(req.body.participantFormat || ''); const reasonCategory = String(req.body.reasonCategory || '');
    const timezone = text(req.body.timezone, 64); const preferredProfessionalId = req.body.preferredProfessionalId ? Number(req.body.preferredProfessionalId) : null;
    if (!SERVICE_CODE.test(serviceType) || !['online','in_person'].includes(deliveryMode) || !['individual','couple','family','group'].includes(participantFormat) ||
      !['anxiety_panic','grief','family_conflict','stress','couple_problems','parent_guidance','other'].includes(reasonCategory) || !validTimezone(timezone) ||
      (preferredProfessionalId !== null && (!Number.isSafeInteger(preferredProfessionalId) || preferredProfessionalId < 1))) return res.status(422).json({ error: 'Revisa los datos de la solicitud.' });
    const safety = req.body.emergencyCurrent === true || req.body.selfOrOthersRisk === true;
    const reference = crypto.randomUUID();
    const id = await withTransaction(async connection => {
      const [[type]] = await connection.execute('SELECT code FROM service_type_catalog WHERE code=? AND active=TRUE LIMIT 1', [serviceType]);
      if (!type) return null;
      const [created] = await connection.execute(`INSERT INTO service_requests
        (public_id,user_id,service_type,delivery_mode,participant_format,reason_category,timezone,preferred_professional_id,emergency_current,self_or_others_risk,physical_symptoms,notes,status)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [reference, req.authUser.id, serviceType, deliveryMode, participantFormat, reasonCategory, timezone,
        preferredProfessionalId, safety && req.body.emergencyCurrent === true, safety && req.body.selfOrOthersRisk === true, req.body.physicalSymptoms === true,
        text(req.body.notes, 2000) || null, safety ? 'safety_review' : 'pending_scheduling']);
      await audit(req, 'service_request_created', 'service_request', created.insertId, { serviceType, safetyReview: safety }, { db: connection, required: true });
      return created.insertId;
    });
    if (!id) return res.status(422).json({ error: 'Tipo de servicio no disponible.' });
    return res.status(201).json({ message: safety ? 'Solicitud recibida para revisión prioritaria. Si existe peligro inmediato, contacta emergencias locales.' : 'Solicitud de consulta recibida.', reference });
  } catch (error) { return next(error); }
});

router.get('/service-requests/my', requireRole('student'), async (req, res, next) => {
  try {
    const [requests] = await pool.execute(`SELECT r.public_id AS reference,c.name AS serviceName,r.delivery_mode AS deliveryMode,
      r.participant_format AS participantFormat,r.status,r.created_at AS createdAt FROM service_requests r JOIN service_type_catalog c ON c.code=r.service_type
      WHERE r.user_id=? ORDER BY r.created_at DESC`, [req.authUser.id]);
    return res.json({ requests });
  } catch (error) { return next(error); }
});

router.post('/courses/:courseId/manual-order', requireApprovedStudent, verifyCsrf, async (req, res, next) => {
  try {
    const courseId = Number(req.params.courseId); const priceId = Number(req.body?.priceId);
    if (!Number.isSafeInteger(courseId) || !Number.isSafeInteger(priceId)) return res.status(422).json({ error: 'Curso o precio inválido.' });
    const order = await withTransaction(async connection => {
      const [[offer]] = await connection.execute(`SELECT c.title,p.id AS productId,pp.currency,pp.amount_minor AS amountMinor
        FROM courses c JOIN products p ON p.course_id=c.id AND p.active=TRUE JOIN product_prices pp ON pp.product_id=p.id AND pp.active=TRUE
        WHERE c.id=? AND pp.id=? AND c.status='published' AND c.access_type='paid' LIMIT 1 FOR UPDATE`, [courseId, priceId]);
      if (!offer) return null;
      const reference = crypto.randomUUID();
      const [created] = await connection.execute('INSERT INTO orders (public_id,buyer_user_id,currency,total_minor) VALUES (?,?,?,?)', [reference, req.authUser.id, offer.currency, offer.amountMinor]);
      await connection.execute('INSERT INTO order_items (order_id,product_id,description,unit_amount_minor) VALUES (?,?,?,?)', [created.insertId, offer.productId, offer.title, offer.amountMinor]);
      await connection.execute("INSERT INTO payments (order_id,provider,payment_method,currency,amount_minor,reference_currency,reference_amount_minor) VALUES (?,'manual','manual_transfer',?,?,?,?)",
        [created.insertId, offer.currency, offer.amountMinor, offer.currency, offer.amountMinor]);
      await audit(req, 'manual_payment_order_created', 'order', created.insertId, { courseId }, { db: connection, required: true });
      return { reference, currency: offer.currency, amountMinor: offer.amountMinor };
    });
    if (!order) return res.status(404).json({ error: 'Curso o precio no disponible.' });
    return res.status(201).json({ message: 'Orden creada. Carga el comprobante para validarla.', order });
  } catch (error) { return next(error); }
});

router.post('/consultation-holds/:holdId/manual-order', requireRole('student'), verifyCsrf, async (req, res, next) => {
  try {
    const holdId = text(req.params.holdId, 36); const priceId = Number(req.body?.priceId);
    if (!/^[0-9a-f-]{36}$/i.test(holdId) || !Number.isSafeInteger(priceId)) return res.status(422).json({ error: 'Reserva o precio inválido.' });
    const order = await withTransaction(async connection => {
      const [[offer]] = await connection.execute(`SELECT h.professional_id AS professionalId,h.service_id AS serviceId,h.start_at AS startAt,h.end_at AS endAt,h.expires_at AS expiresAt,
        h.service_request_id AS serviceRequestId,s.name,p.id AS productId,pp.currency,pp.amount_minor AS amountMinor,prof.timezone
        FROM appointment_holds h JOIN professional_services s ON s.id=h.service_id AND s.active=TRUE JOIN professional_profiles prof ON prof.id=h.professional_id
        JOIN products p ON p.service_id=s.id AND p.active=TRUE JOIN product_prices pp ON pp.product_id=p.id AND pp.active=TRUE
        WHERE h.id=? AND h.client_user_id=? AND h.expires_at>UTC_TIMESTAMP() AND pp.id=? LIMIT 1 FOR UPDATE`, [holdId, req.authUser.id, priceId]);
      if (!offer) return null;
      const reference = crypto.randomUUID(); const appointmentReference = crypto.randomUUID();
      const [created] = await connection.execute('INSERT INTO orders (public_id,buyer_user_id,currency,total_minor) VALUES (?,?,?,?)', [reference, req.authUser.id, offer.currency, offer.amountMinor]);
      await connection.execute('INSERT INTO order_items (order_id,product_id,description,unit_amount_minor) VALUES (?,?,?,?)', [created.insertId, offer.productId, offer.name, offer.amountMinor]);
      await connection.execute("INSERT INTO payments (order_id,provider,payment_method,currency,amount_minor,reference_currency,reference_amount_minor) VALUES (?,'manual','manual_transfer',?,?,?,?)",
        [created.insertId, offer.currency, offer.amountMinor, offer.currency, offer.amountMinor]);
      await connection.execute(`INSERT INTO appointments (public_id,hold_reference,professional_id,service_id,service_request_id,client_user_id,start_at,end_at,timezone,status,order_id,payment_expires_at)
        VALUES (?,?,?,?,?,?,?,?,?,'pending_payment',?,?)`, [appointmentReference, holdId, offer.professionalId, offer.serviceId, offer.serviceRequestId, req.authUser.id, offer.startAt, offer.endAt, offer.timezone, created.insertId, offer.expiresAt]);
      await connection.execute('DELETE FROM appointment_holds WHERE id=?', [holdId]);
      await audit(req, 'manual_consultation_order_created', 'order', created.insertId, { serviceId: offer.serviceId }, { db: connection, required: true });
      return { reference, appointmentReference, currency: offer.currency, amountMinor: offer.amountMinor };
    });
    if (!order) return res.status(409).json({ error: 'La reserva expiró o el precio ya no está disponible.' });
    return res.status(201).json({ message: 'Orden creada. Carga el comprobante para validar la consulta.', order });
  } catch (error) { return next(error); }
});

router.post('/orders/:reference/receipt', requireAuth, verifyCsrf,
  express.raw({ type: ['image/jpeg','image/png','image/webp','application/pdf'], limit: '5mb' }), async (req, res, next) => {
    try {
      const reference = text(req.params.reference, 36); const declaredMime = String(req.get('content-type') || '').split(';')[0];
      const name = text(req.get('x-file-name') || 'comprobante', 255);
      const mime = detectReceiptMime(req.body);
      if (!req.body?.length || !mime || mime !== declaredMime) return res.status(422).json({ error: 'Adjunta un comprobante JPG, PNG, WebP o PDF válido de hasta 5 MB.' });
      const saved = await withTransaction(async connection => {
        const [[order]] = await connection.execute('SELECT id FROM orders WHERE public_id=? AND buyer_user_id=? LIMIT 1 FOR UPDATE', [reference, req.authUser.id]);
        if (!order) return false;
        await connection.execute(`INSERT INTO payment_receipts (order_id,uploader_user_id,original_name,mime_type,size_bytes,file_data)
          VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE original_name=VALUES(original_name),mime_type=VALUES(mime_type),size_bytes=VALUES(size_bytes),file_data=VALUES(file_data),status='pending',reviewed_by=NULL,reviewed_at=NULL`,
        [order.id, req.authUser.id, name, mime, req.body.length, req.body]);
        await audit(req, 'payment_receipt_uploaded', 'order', order.id, null, { db: connection, required: true });
        return true;
      });
      if (!saved) return res.status(404).json({ error: 'Orden no encontrada.' });
      return res.status(201).json({ message: 'Comprobante recibido para revisión.' });
    } catch (error) { return next(error); }
  });

router.get('/payment-receipts', requireCapability(CAPABILITIES.SCHEDULING_MANAGE), async (_req, res, next) => {
  try {
    const [receipts] = await pool.execute(`SELECT r.id,o.public_id AS orderReference,u.full_name AS customer,r.original_name AS originalName,
      r.mime_type AS mimeType,r.size_bytes AS sizeBytes,r.status,r.created_at AS createdAt,
      p.payment_method AS paymentMethod,p.currency AS settlementCurrency,p.amount_minor AS settlementAmountMinor,
      p.reference_currency AS referenceCurrency,p.reference_amount_minor AS referenceAmountMinor
      FROM payment_receipts r JOIN orders o ON o.id=r.order_id JOIN users u ON u.id=r.uploader_user_id
      LEFT JOIN payments p ON p.order_id=o.id ORDER BY FIELD(r.status,'pending','rejected','accepted'),r.created_at DESC LIMIT 200`);
    return res.json({ receipts });
  } catch (error) { return next(error); }
});

router.get('/appointments/manage', requireCapability(CAPABILITIES.SCHEDULING_MANAGE), async (_req, res, next) => {
  try {
    const [appointments] = await pool.execute(`SELECT a.public_id AS reference,a.start_at AS startAt,a.status,u.full_name AS client,
      s.name AS serviceName,COALESCE(cp.status,'not_started') AS clinicalProgress FROM appointments a
      JOIN users u ON u.id=a.client_user_id JOIN professional_services s ON s.id=a.service_id
      LEFT JOIN clinical_record_progress cp ON cp.appointment_id=a.id ORDER BY a.start_at DESC LIMIT 200`);
    return res.json({ appointments });
  } catch (error) { return next(error); }
});

router.get('/payment-receipts/:id/file', requireCapability(CAPABILITIES.SCHEDULING_MANAGE), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(404).end();
    const [[receipt]] = await pool.execute('SELECT original_name AS originalName,mime_type AS mimeType,file_data AS fileData FROM payment_receipts WHERE id=? LIMIT 1', [id]);
    if (!receipt) return res.status(404).end();
    const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
    const extension = extensions[receipt.mimeType];
    if (!extension) return res.status(415).json({ error: 'Tipo de comprobante no admitido.' });
    const filename = `comprobante-${id}.${extension}`;
    res.set('Content-Type', receipt.mimeType); res.set('Content-Disposition', `attachment; filename="${filename}"`); res.set('X-Content-Type-Options', 'nosniff'); res.set('Cache-Control', 'private, no-store');
    return res.end(receipt.fileData);
  } catch (error) { return next(error); }
});

router.patch('/payment-receipts/:id/review', requireCapability(CAPABILITIES.SCHEDULING_MANAGE), verifyCsrf, async (req, res, next) => {
  try {
    const id = Number(req.params.id); const decision = String(req.body.decision || '');
    if (!Number.isSafeInteger(id) || !['accepted','rejected'].includes(decision)) return res.status(422).json({ error: 'Revisión inválida.' });
    const outcome = await withTransaction(async connection => {
      const [[receipt]] = await connection.execute(`SELECT r.order_id AS orderId,o.buyer_user_id AS userId,u.email FROM payment_receipts r
        JOIN orders o ON o.id=r.order_id JOIN users u ON u.id=o.buyer_user_id WHERE r.id=? AND r.status='pending' LIMIT 1 FOR UPDATE`, [id]);
      if (!receipt) return null;
      await connection.execute('UPDATE payment_receipts SET status=?,reviewed_by=?,reviewed_at=UTC_TIMESTAMP() WHERE id=?', [decision, req.authUser.id, id]);
      if (decision === 'accepted') {
        await connection.execute("UPDATE orders SET status='paid',paid_at=COALESCE(paid_at,UTC_TIMESTAMP()) WHERE id=?", [receipt.orderId]);
        await connection.execute("UPDATE payments SET status='approved',approved_at=COALESCE(approved_at,UTC_TIMESTAMP()),payment_method='manual_transfer' WHERE order_id=?", [receipt.orderId]);
        const [[purchase]] = await connection.execute(`SELECT o.buyer_user_id AS buyerId,p.course_id AS courseId,p.service_id AS serviceId
          FROM orders o JOIN order_items oi ON oi.order_id=o.id JOIN products p ON p.id=oi.product_id WHERE o.id=? LIMIT 1`, [receipt.orderId]);
        if (purchase?.courseId) await connection.execute(`INSERT INTO course_enrollments (course_id,student_id,enrolled_by,enrollment_source,order_id)
          VALUES (?,?,?,'paid',?) ON DUPLICATE KEY UPDATE enrollment_source='paid',order_id=VALUES(order_id),status=IF(status='completed','completed','active')`,
        [purchase.courseId, purchase.buyerId, purchase.buyerId, receipt.orderId]);
        if (purchase?.serviceId) {
          const [[appointment]] = await connection.execute("SELECT id,status,payment_expires_at AS paymentExpiresAt FROM appointments WHERE order_id=? LIMIT 1 FOR UPDATE", [receipt.orderId]);
          if (appointment?.status === 'pending_payment' && new Date(appointment.paymentExpiresAt) > new Date()) {
            await connection.execute("UPDATE appointments SET status='confirmed' WHERE id=?", [appointment.id]);
            await connection.execute("INSERT INTO appointment_events (appointment_id,event_type,details) VALUES (?,'payment_confirmed',JSON_OBJECT('orderId',?,'method','manual_transfer'))", [appointment.id, receipt.orderId]);
          }
        }
      }
      const title = decision === 'accepted' ? 'Pago confirmado' : 'Comprobante rechazado';
      const message = decision === 'accepted' ? 'Tu comprobante fue aprobado y el pago quedó confirmado.' : 'Tu comprobante no pudo validarse. Revisa los datos y vuelve a cargarlo.';
      await createNotification({ userId: receipt.userId, type: 'payment_receipt_reviewed', title, message, actionUrl: '/estudiante.html', db: connection });
      await audit(req, 'payment_receipt_reviewed', 'payment_receipt', id, { decision }, { db: connection, required: true });
      return { ...receipt, title, message };
    });
    if (!outcome) return res.status(404).json({ error: 'Comprobante pendiente no encontrado.' });
    await emailNotification({ to: outcome.email, title: outcome.title, message: outcome.message, actionUrl: '/estudiante.html', idempotencyKey: `receipt-review/${id}/${decision}` });
    return res.json({ message: 'Comprobante revisado.' });
  } catch (error) { return next(error); }
});

router.patch('/appointments/:reference/clinical-progress', requireCapability(CAPABILITIES.SCHEDULING_MANAGE), verifyCsrf, async (req, res, next) => {
  try {
    const status = String(req.body.status || ''); const reference = text(req.params.reference, 36);
    if (!['not_started','intake_pending','in_progress','follow_up','closed'].includes(status)) return res.status(422).json({ error: 'Estado de progreso inválido.' });
    const outcome = await withTransaction(async connection => {
      const [[appointment]] = await connection.execute('SELECT id,client_user_id AS userId FROM appointments WHERE public_id=? LIMIT 1 FOR UPDATE', [reference]);
      if (!appointment) return null;
      await connection.execute(`INSERT INTO clinical_record_progress (appointment_id,status,updated_by) VALUES (?,?,?)
        ON DUPLICATE KEY UPDATE status=VALUES(status),updated_by=VALUES(updated_by),updated_at=UTC_TIMESTAMP()`, [appointment.id, status, req.authUser.id]);
      await createNotification({ userId: appointment.userId, type: 'clinical_progress_updated', title: 'Seguimiento de consulta actualizado', message: `El estado administrativo de tu consulta cambió a ${status}.`, actionUrl: '/estudiante.html', db: connection });
      await audit(req, 'clinical_progress_updated', 'appointment', appointment.id, { status }, { db: connection, required: true });
      return appointment;
    });
    if (!outcome) return res.status(404).json({ error: 'Consulta no encontrada.' });
    return res.json({ message: 'Progreso administrativo actualizado.' });
  } catch (error) { return next(error); }
});

router.get('/subscription-plans', requireAuth, async (_req, res, next) => {
  try {
    const [plans] = await pool.execute(`SELECT sp.id,sp.name,sp.currency,sp.amount_minor AS amountMinor,sp.interval_unit AS intervalUnit,
      sp.interval_count AS intervalCount,p.name AS productName FROM subscription_plans sp JOIN products p ON p.id=sp.product_id WHERE sp.active=TRUE ORDER BY sp.name`);
    return res.json({ plans });
  } catch (error) { return next(error); }
});

router.post('/subscription-plans', requireCapability(CAPABILITIES.COURSE_MANAGE_ALL), verifyCsrf, async (req, res, next) => {
  try {
    const productId = Number(req.body.productId); const amountMinor = Number(req.body.amountMinor); const intervalCount = Number(req.body.intervalCount || 1);
    const currency = text(req.body.currency, 3).toUpperCase(); const intervalUnit = String(req.body.intervalUnit || ''); const name = text(req.body.name, 180);
    if (!Number.isSafeInteger(productId) || !Number.isSafeInteger(amountMinor) || amountMinor < 1 || !Number.isInteger(intervalCount) || intervalCount < 1 || intervalCount > 12 || !['ARS','USD'].includes(currency) || !['month','year'].includes(intervalUnit) || name.length < 3) return res.status(422).json({ error: 'Datos del plan inválidos.' });
    const [created] = await pool.execute('INSERT INTO subscription_plans (product_id,name,currency,amount_minor,interval_unit,interval_count) VALUES (?,?,?,?,?,?)', [productId, name, currency, amountMinor, intervalUnit, intervalCount]);
    await audit(req, 'subscription_plan_created', 'subscription_plan', created.insertId, { currency, amountMinor, intervalUnit, intervalCount });
    return res.status(201).json({ message: 'Plan de suscripción creado.', id: created.insertId });
  } catch (error) { return next(error); }
});

router.get('/subscriptions/my', requireRole('student'), async (req, res, next) => {
  try {
    const [subscriptions] = await pool.execute(`SELECT s.public_id AS reference,s.status,s.current_period_start AS currentPeriodStart,
      s.current_period_end AS currentPeriodEnd,p.name,p.currency,p.amount_minor AS amountMinor,p.interval_unit AS intervalUnit,p.interval_count AS intervalCount
      FROM subscriptions s JOIN subscription_plans p ON p.id=s.plan_id WHERE s.user_id=? ORDER BY s.created_at DESC`, [req.authUser.id]);
    return res.json({ subscriptions });
  } catch (error) { return next(error); }
});

router.post('/subscriptions', requireRole('student'), verifyCsrf, async (req, res, next) => {
  try {
    const planId = Number(req.body.planId);
    if (!Number.isSafeInteger(planId) || planId < 1) return res.status(422).json({ error: 'Plan inválido.' });
    const reference = crypto.randomUUID();
    const created = await withTransaction(async connection => {
      const [[plan]] = await connection.execute('SELECT id FROM subscription_plans WHERE id=? AND active=TRUE LIMIT 1 FOR UPDATE', [planId]);
      if (!plan) return false;
      const [[existing]] = await connection.execute("SELECT id FROM subscriptions WHERE user_id=? AND plan_id=? AND status IN ('pending','active','past_due') LIMIT 1", [req.authUser.id, planId]);
      if (existing) return 'exists';
      const [result] = await connection.execute('INSERT INTO subscriptions (public_id,user_id,plan_id) VALUES (?,?,?)', [reference, req.authUser.id, planId]);
      await audit(req, 'subscription_requested', 'subscription', result.insertId, { planId }, { db: connection, required: true });
      return true;
    });
    if (!created) return res.status(404).json({ error: 'Plan no disponible.' });
    if (created === 'exists') return res.status(409).json({ error: 'Ya tienes una suscripción vigente o pendiente para este plan.' });
    return res.status(201).json({ message: 'Suscripción creada. Queda pendiente de vincular el cobro recurrente.', reference });
  } catch (error) { return next(error); }
});

router.patch('/subscriptions/:reference/cancel', requireRole('student'), verifyCsrf, async (req, res, next) => {
  try {
    const [result] = await pool.execute("UPDATE subscriptions SET status='cancelled',cancelled_at=UTC_TIMESTAMP() WHERE public_id=? AND user_id=? AND status IN ('pending','active','past_due')", [text(req.params.reference, 36), req.authUser.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Suscripción cancelable no encontrada.' });
    return res.json({ message: 'Suscripción cancelada.' });
  } catch (error) { return next(error); }
});

module.exports = router;
