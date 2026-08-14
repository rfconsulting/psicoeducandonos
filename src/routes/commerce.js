const crypto = require('node:crypto');
const express = require('express');
const pool = require('../config/database');
const env = require('../config/env');
const { requireAuth, requireApprovedStudent, requireCapability, verifyCsrf } = require('../middleware/security');
const { CAPABILITIES } = require('../constants/access');
const { courseForManagement } = require('../services/course-management');
const { fakeProvider, mercadoPagoProvider, verifySignature, verifyMercadoPagoSignature } = require('../services/payment-provider');
const withTransaction = require('../services/transaction');
const audit = require('../services/audit');

const router = express.Router();
function activeProvider() {
  if (env.paymentProvider === 'mercadopago') return mercadoPagoProvider({ accessToken: env.mercadoPagoAccessToken, appPublicUrl: env.appPublicUrl });
  return fakeProvider({ appPublicUrl: env.appPublicUrl });
}

router.post('/courses/:courseId/prices', requireCapability(CAPABILITIES.COURSE_CREATE), verifyCsrf, async (req, res, next) => {
  try {
    const courseId = Number(req.params.courseId);
    const currency = String(req.body.currency || '').trim().toUpperCase();
    const amountMinor = Number(req.body.amountMinor);
    if (!Number.isSafeInteger(courseId) || !/^[A-Z]{3}$/.test(currency) || !Number.isSafeInteger(amountMinor) || amountMinor < 1) {
      return res.status(422).json({ error: 'Curso, moneda o importe inválido.' });
    }
    const course = await courseForManagement(pool, req.authUser, courseId);
    if (!course) return res.status(404).json({ error: 'Curso no encontrado.' });
    const priceId = await withTransaction(async connection => {
      await connection.execute('INSERT INTO products (course_id,name) SELECT id,title FROM courses WHERE id=? ON DUPLICATE KEY UPDATE name=VALUES(name),active=TRUE', [courseId]);
      const [[product]] = await connection.execute('SELECT id FROM products WHERE course_id=? LIMIT 1', [courseId]);
      await connection.execute('UPDATE product_prices SET active=FALSE WHERE product_id=? AND currency=?', [product.id, currency]);
      const [result] = await connection.execute('INSERT INTO product_prices (product_id,currency,amount_minor) VALUES (?,?,?)', [product.id, currency, amountMinor]);
      await connection.execute("UPDATE courses SET access_type='paid' WHERE id=?", [courseId]);
      await audit(req, 'course_price_created', 'course', courseId, { currency, amountMinor }, { db: connection, required: true });
      return result.insertId;
    });
    return res.status(201).json({ message: 'Precio creado.', id: priceId });
  } catch (error) { return next(error); }
});

router.post('/services/:serviceId/prices', requireCapability(CAPABILITIES.SCHEDULING_MANAGE), verifyCsrf, async (req, res, next) => {
  try {
    const serviceId = Number(req.params.serviceId); const currency = String(req.body.currency || '').trim().toUpperCase(); const amountMinor = Number(req.body.amountMinor);
    if (!Number.isSafeInteger(serviceId) || !['ARS','USD'].includes(currency) || !Number.isSafeInteger(amountMinor) || amountMinor < 1) return res.status(422).json({ error: 'Servicio, moneda o importe inválido.' });
    const id = await withTransaction(async connection => {
      const [[service]] = await connection.execute('SELECT id,name FROM professional_services WHERE id=? AND active=TRUE LIMIT 1 FOR UPDATE', [serviceId]);
      if (!service) return null;
      await connection.execute('INSERT INTO products (service_id,name) VALUES (?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),active=TRUE', [serviceId, service.name]);
      const [[product]] = await connection.execute('SELECT id FROM products WHERE service_id=? LIMIT 1 FOR UPDATE', [serviceId]);
      await connection.execute('UPDATE product_prices SET active=FALSE WHERE product_id=? AND currency=?', [product.id, currency]);
      const [created] = await connection.execute('INSERT INTO product_prices (product_id,currency,amount_minor) VALUES (?,?,?)', [product.id, currency, amountMinor]);
      await audit(req, 'service_price_created', 'professional_service', serviceId, { currency, amountMinor }, { db: connection, required: true });
      return created.insertId;
    });
    if (!id) return res.status(404).json({ error: 'Servicio no encontrado.' });
    return res.status(201).json({ message: 'Precio del servicio creado.', id });
  } catch (error) { return next(error); }
});

router.post('/courses/:courseId/checkout', requireApprovedStudent, verifyCsrf, async (req, res, next) => {
  try {
    if (env.paymentProvider === 'disabled') return res.status(503).json({ error: 'Los pagos todavía no están habilitados.' });
    const courseId = Number(req.params.courseId);
    const priceId = Number(req.body.priceId);
    if (!Number.isSafeInteger(courseId) || !Number.isSafeInteger(priceId)) return res.status(422).json({ error: 'Curso o precio inválido.' });
    const order = await withTransaction(async connection => {
      const [[offer]] = await connection.execute(
        `SELECT c.id AS courseId,c.title,p.id AS productId,pp.id AS priceId,pp.currency,pp.amount_minor AS amountMinor
         FROM courses c JOIN products p ON p.course_id=c.id AND p.active=TRUE
         JOIN product_prices pp ON pp.product_id=p.id AND pp.active=TRUE
         WHERE c.id=? AND pp.id=? AND c.status='published' AND c.access_type='paid'
           AND c.enrollment_policy IN ('open','approved_students') LIMIT 1 FOR UPDATE`,
        [courseId, priceId]
      );
      if (!offer) return null;
      if (env.paymentProvider === 'mercadopago' && offer.currency !== 'ARS') return { unsupported: true };
      const reference = crypto.randomUUID();
      const [created] = await connection.execute('INSERT INTO orders (public_id,buyer_user_id,currency,total_minor) VALUES (?,?,?,?)', [reference, req.authUser.id, offer.currency, offer.amountMinor]);
      await connection.execute('INSERT INTO order_items (order_id,product_id,description,unit_amount_minor) VALUES (?,?,?,?)', [created.insertId, offer.productId, offer.title, offer.amountMinor]);
      const provider = activeProvider();
      const checkout = await provider.createCheckout({ orderReference: reference, description: offer.title, amountMinor: offer.amountMinor });
      await connection.execute('INSERT INTO payments (order_id,provider,provider_checkout_id,provider_payment_id,currency,amount_minor) VALUES (?,?,?,?,?,?)', [created.insertId, provider.name, checkout.providerCheckoutId || null, checkout.providerPaymentId || null, offer.currency, offer.amountMinor]);
      await connection.execute("UPDATE orders SET status='processing' WHERE id=?", [created.insertId]);
      await audit(req, 'checkout_created', 'order', created.insertId, { courseId, currency: offer.currency, amountMinor: offer.amountMinor }, { db: connection, required: true });
      return { reference, checkoutUrl: checkout.checkoutUrl };
    });
    if (order?.unsupported) return res.status(422).json({ error: 'Mercado Pago solo está habilitado para ofertas en ARS.' });
    if (!order) return res.status(404).json({ error: 'Curso o precio no disponible.' });
    return res.status(201).json({ order });
  } catch (error) { return next(error); }
});

router.post('/consultation-holds/:holdId/checkout', requireApprovedStudent, verifyCsrf, async (req, res, next) => {
  try {
    if (env.paymentProvider === 'disabled') return res.status(503).json({ error: 'Los pagos todavía no están habilitados.' });
    const holdId = String(req.params.holdId || '').slice(0, 36); const priceId = Number(req.body.priceId);
    if (!/^[0-9a-f-]{36}$/i.test(holdId) || !Number.isSafeInteger(priceId)) return res.status(422).json({ error: 'Reserva o precio inválido.' });
    const order = await withTransaction(async connection => {
      const [[previous]] = await connection.execute(`SELECT o.public_id AS reference FROM appointments a JOIN orders o ON o.id=a.order_id
        WHERE a.hold_reference=? AND a.client_user_id=? LIMIT 1 FOR UPDATE`, [holdId, req.authUser.id]);
      if (previous) return { reference: previous.reference, checkoutUrl: fakeProvider({ appPublicUrl: env.appPublicUrl }).createCheckout({ orderReference: previous.reference }).checkoutUrl, reused: true };
      const [[offer]] = await connection.execute(`SELECT h.id AS holdId,h.professional_id AS professionalId,h.service_id AS serviceId,h.start_at AS startAt,h.end_at AS endAt,h.expires_at AS expiresAt,
        s.name,p.id AS productId,pp.currency,pp.amount_minor AS amountMinor,prof.timezone
        FROM appointment_holds h JOIN professional_services s ON s.id=h.service_id AND s.active=TRUE
        JOIN professional_profiles prof ON prof.id=h.professional_id AND prof.status='active'
        JOIN products p ON p.service_id=s.id AND p.active=TRUE JOIN product_prices pp ON pp.product_id=p.id AND pp.active=TRUE
        WHERE h.id=? AND h.client_user_id=? AND h.expires_at>UTC_TIMESTAMP() AND pp.id=? LIMIT 1 FOR UPDATE`, [holdId, req.authUser.id, priceId]);
      if (!offer) return null;
      if (env.paymentProvider === 'mercadopago' && offer.currency !== 'ARS') return { unsupported: true };
      const reference = crypto.randomUUID();
      const [created] = await connection.execute('INSERT INTO orders (public_id,buyer_user_id,currency,total_minor) VALUES (?,?,?,?)', [reference, req.authUser.id, offer.currency, offer.amountMinor]);
      await connection.execute('INSERT INTO order_items (order_id,product_id,description,unit_amount_minor) VALUES (?,?,?,?)', [created.insertId, offer.productId, offer.name, offer.amountMinor]);
      const provider = activeProvider();
      const checkout = await provider.createCheckout({ orderReference: reference, description: offer.name, amountMinor: offer.amountMinor });
      await connection.execute('INSERT INTO payments (order_id,provider,provider_checkout_id,provider_payment_id,currency,amount_minor) VALUES (?,?,?,?,?,?)', [created.insertId, provider.name, checkout.providerCheckoutId || null, checkout.providerPaymentId || null, offer.currency, offer.amountMinor]);
      const appointmentReference = crypto.randomUUID();
      const [appointment] = await connection.execute(`INSERT INTO appointments
        (public_id,hold_reference,professional_id,service_id,client_user_id,start_at,end_at,timezone,status,order_id,payment_expires_at)
        VALUES (?,?,?,?,?,?,?,?, 'pending_payment',?,?)`, [appointmentReference, holdId, offer.professionalId, offer.serviceId, req.authUser.id, offer.startAt, offer.endAt, offer.timezone, created.insertId, offer.expiresAt]);
      await connection.execute('INSERT INTO appointment_events (appointment_id,actor_user_id,event_type,new_start_at) VALUES (?,?,\'payment_started\',?)', [appointment.insertId, req.authUser.id, offer.startAt]);
      await connection.execute('DELETE FROM appointment_holds WHERE id=?', [holdId]);
      await connection.execute("UPDATE orders SET status='processing' WHERE id=?", [created.insertId]);
      await audit(req, 'consultation_checkout_created', 'appointment', appointment.insertId, { orderId: created.insertId, currency: offer.currency, amountMinor: offer.amountMinor }, { db: connection, required: true });
      return { reference, checkoutUrl: checkout.checkoutUrl, appointmentReference };
    });
    if (order?.unsupported) return res.status(422).json({ error: 'Mercado Pago solo está habilitado para ofertas en ARS.' });
    if (!order) return res.status(409).json({ error: 'La reserva expiró o el precio ya no está disponible.' });
    return res.status(order.reused ? 200 : 201).json({ order });
  } catch (error) { return next(error); }
});

router.get('/orders/:reference', requireAuth, async (req, res, next) => {
  try {
    const [[order]] = await pool.execute('SELECT public_id AS reference,status,currency,total_minor AS totalMinor,paid_at AS paidAt,created_at AS createdAt FROM orders WHERE public_id=? AND buyer_user_id=? LIMIT 1', [String(req.params.reference).slice(0, 36), req.authUser.id]);
    if (!order) return res.status(404).json({ error: 'Orden no encontrada.' });
    return res.json({ order });
  } catch (error) { return next(error); }
});

router.post('/webhooks/fake', async (req, res, next) => {
  try {
    if (env.paymentProvider !== 'fake') return res.status(404).json({ error: 'Ruta no encontrada.' });
    const timestamp = req.get('x-payment-timestamp');
    const received = req.get('x-payment-signature');
    if (!verifySignature(env.fakePaymentWebhookSecret, timestamp, req.rawBody || Buffer.alloc(0), received)) return res.status(401).json({ error: 'Firma inválida.' });
    const eventId = String(req.body.eventId || '').slice(0, 128);
    const providerPaymentId = String(req.body.paymentId || '').slice(0, 128);
    const eventStatus = String(req.body.status || '');
    if (!eventId || !providerPaymentId || !['approved','rejected','cancelled'].includes(eventStatus)) return res.status(422).json({ error: 'Evento inválido.' });
    const payloadHash = crypto.createHash('sha256').update(req.rawBody).digest('hex');
    const outcome = await withTransaction(async connection => {
      const [claimed] = await connection.execute("INSERT IGNORE INTO payment_events (provider,provider_event_id,event_type,payload_hash,processing_status) VALUES ('fake',?,?,?,'ignored')", [eventId, eventStatus, payloadHash]);
      if (!claimed.affectedRows) return 'duplicate';
      const [[payment]] = await connection.execute('SELECT id,order_id AS orderId,status,currency,amount_minor AS amountMinor FROM payments WHERE provider=? AND provider_payment_id=? LIMIT 1 FOR UPDATE', ['fake', providerPaymentId]);
      if (!payment) {
        return 'ignored';
      }
      const amountMatches = Number(req.body.amountMinor) === Number(payment.amountMinor) && String(req.body.currency || '').toUpperCase() === payment.currency;
      if (!amountMatches) {
        await connection.execute("UPDATE payment_events SET payment_id=?,processing_status='failed' WHERE provider='fake' AND provider_event_id=?", [payment.id, eventId]);
        return 'mismatch';
      }
      if (payment.status !== 'pending') {
        await connection.execute("UPDATE payment_events SET payment_id=? WHERE provider='fake' AND provider_event_id=?", [payment.id, eventId]);
        return 'duplicate_payment';
      }
      await connection.execute("UPDATE payment_events SET payment_id=?,processing_status='processed' WHERE provider='fake' AND provider_event_id=?", [payment.id, eventId]);
      await connection.execute('UPDATE payments SET status=?,approved_at=IF(?=\'approved\',UTC_TIMESTAMP(),NULL) WHERE id=?', [eventStatus, eventStatus, payment.id]);
      if (eventStatus !== 'approved') {
        await connection.execute("UPDATE appointments SET status='expired' WHERE order_id=? AND status='pending_payment'", [payment.orderId]);
        return 'processed';
      }
      await connection.execute("UPDATE orders SET status='paid',paid_at=UTC_TIMESTAMP() WHERE id=? AND status IN ('pending','processing')", [payment.orderId]);
      const [[purchase]] = await connection.execute('SELECT o.buyer_user_id AS buyerId,p.course_id AS courseId,p.service_id AS serviceId FROM orders o JOIN order_items oi ON oi.order_id=o.id JOIN products p ON p.id=oi.product_id WHERE o.id=? LIMIT 1', [payment.orderId]);
      if (purchase?.courseId) await connection.execute(`INSERT INTO course_enrollments (course_id,student_id,enrolled_by,enrollment_source,order_id) VALUES (?,?,?,'paid',?)
        ON DUPLICATE KEY UPDATE enrollment_source='paid',order_id=VALUES(order_id),status=IF(status='completed','completed','active')`, [purchase.courseId, purchase.buyerId, purchase.buyerId, payment.orderId]);
      if (purchase?.serviceId) {
        const [[appointment]] = await connection.execute("SELECT id,status,payment_expires_at AS paymentExpiresAt FROM appointments WHERE order_id=? LIMIT 1 FOR UPDATE", [payment.orderId]);
        if (appointment?.status === 'pending_payment' && new Date(appointment.paymentExpiresAt) > new Date()) {
          await connection.execute("UPDATE appointments SET status='confirmed' WHERE id=?", [appointment.id]);
          await connection.execute("INSERT INTO appointment_events (appointment_id,event_type,details) VALUES (?,'payment_confirmed',JSON_OBJECT('orderId',?))", [appointment.id, payment.orderId]);
        } else {
          await audit(req, 'payment_delivery_failed', 'order', payment.orderId, { reason: 'appointment_expired' }, { db: connection, required: true });
        }
      }
      await audit(req, 'payment_approved', 'order', payment.orderId, { provider: 'fake' }, { db: connection, required: true });
      return 'processed';
    });
    if (outcome === 'mismatch') return res.status(409).json({ error: 'El importe o la moneda no coinciden.' });
    return res.json({ received: true, outcome });
  } catch (error) { return next(error); }
});

router.post('/webhooks/mercadopago', async (req, res, next) => {
  try {
    if (env.paymentProvider !== 'mercadopago') return res.status(404).json({ error: 'Ruta no encontrada.' });
    const dataId = String(req.query['data.id'] || req.body?.data?.id || '').toLowerCase();
    const requestId = req.get('x-request-id');
    if (!verifyMercadoPagoSignature(env.mercadoPagoWebhookSecret, { dataId, requestId, xSignature: req.get('x-signature') })) return res.status(401).json({ error: 'Firma inválida.' });
    const provider = activeProvider(); const external = await provider.fetchPayment(dataId);
    const reference = String(external.external_reference || ''); const eventId = `${external.id}:${external.status}:${external.date_last_updated || ''}`.slice(0, 128);
    const normalizedStatus = external.status === 'approved' ? 'approved' : ['rejected','cancelled'].includes(external.status) ? external.status : 'pending';
    const outcome = await withTransaction(async connection => {
      const [claimed] = await connection.execute("INSERT IGNORE INTO payment_events (provider,provider_event_id,event_type,payload_hash,processing_status) VALUES ('mercadopago',?,?,SHA2(?,256),'ignored')", [eventId, normalizedStatus, JSON.stringify({ id: external.id, status: external.status })]);
      if (!claimed.affectedRows) return 'duplicate';
      const [[payment]] = await connection.execute(`SELECT pay.id,pay.order_id AS orderId,pay.status,pay.currency,pay.amount_minor AS amountMinor
        FROM payments pay JOIN orders o ON o.id=pay.order_id WHERE pay.provider='mercadopago' AND o.public_id=? LIMIT 1 FOR UPDATE`, [reference]);
      if (!payment) return 'ignored';
      const valid = external.currency_id === 'ARS' && Math.round(Number(external.transaction_amount) * 100) === Number(payment.amountMinor)
        && String(external.collector_id) === env.mercadoPagoUserId;
      if (!valid) { await connection.execute("UPDATE payment_events SET payment_id=?,processing_status='failed' WHERE provider='mercadopago' AND provider_event_id=?", [payment.id, eventId]); return 'mismatch'; }
      await connection.execute("UPDATE payment_events SET payment_id=?,processing_status='processed' WHERE provider='mercadopago' AND provider_event_id=?", [payment.id, eventId]);
      if (payment.status !== 'pending' || normalizedStatus === 'pending') return 'ignored';
      await connection.execute('UPDATE payments SET provider_payment_id=?,status=?,approved_at=IF(?=\'approved\',UTC_TIMESTAMP(),NULL) WHERE id=?', [String(external.id), normalizedStatus, normalizedStatus, payment.id]);
      if (normalizedStatus !== 'approved') { await connection.execute("UPDATE appointments SET status='expired' WHERE order_id=? AND status='pending_payment'", [payment.orderId]); return 'processed'; }
      await connection.execute("UPDATE orders SET status='paid',paid_at=UTC_TIMESTAMP() WHERE id=? AND status IN ('pending','processing')", [payment.orderId]);
      const [[purchase]] = await connection.execute('SELECT o.buyer_user_id AS buyerId,p.course_id AS courseId,p.service_id AS serviceId FROM orders o JOIN order_items oi ON oi.order_id=o.id JOIN products p ON p.id=oi.product_id WHERE o.id=? LIMIT 1', [payment.orderId]);
      if (purchase?.courseId) await connection.execute(`INSERT INTO course_enrollments (course_id,student_id,enrolled_by,enrollment_source,order_id) VALUES (?,?,?,'paid',?) ON DUPLICATE KEY UPDATE enrollment_source='paid',order_id=VALUES(order_id),status=IF(status='completed','completed','active')`, [purchase.courseId, purchase.buyerId, purchase.buyerId, payment.orderId]);
      if (purchase?.serviceId) {
        const [[appointment]] = await connection.execute("SELECT id,status,payment_expires_at AS paymentExpiresAt FROM appointments WHERE order_id=? LIMIT 1 FOR UPDATE", [payment.orderId]);
        if (appointment?.status === 'pending_payment' && new Date(appointment.paymentExpiresAt) > new Date()) { await connection.execute("UPDATE appointments SET status='confirmed' WHERE id=?", [appointment.id]); await connection.execute("INSERT INTO appointment_events (appointment_id,event_type,details) VALUES (?,'payment_confirmed',JSON_OBJECT('orderId',?))", [appointment.id, payment.orderId]); }
        else await audit(req, 'payment_delivery_failed', 'order', payment.orderId, { reason: 'appointment_expired' }, { db: connection, required: true });
      }
      await audit(req, 'payment_approved', 'order', payment.orderId, { provider: 'mercadopago' }, { db: connection, required: true });
      return 'processed';
    });
    if (outcome === 'mismatch') return res.status(409).json({ error: 'El pago no coincide con la orden.' });
    return res.json({ received: true, outcome });
  } catch (error) { return next(error); }
});

module.exports = router;
