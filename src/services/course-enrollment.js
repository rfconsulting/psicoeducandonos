function catalogAvailability(course, { approved = false, enrolled = false, paymentsEnabled = false } = {}) {
  if (enrolled) return { code: 'enrolled', canSelfEnroll: false };
  if (course.enrollmentPolicy === 'admin_only') return { code: 'admin_only', canSelfEnroll: false };
  if (course.enrollmentPolicy === 'approved_students' && !approved) {
    return { code: 'approval_required', canSelfEnroll: false };
  }
  if (course.accessType === 'paid') return { code: paymentsEnabled && course.prices?.length ? 'checkout_available' : 'payment_unavailable', canSelfEnroll: false, canCheckout: paymentsEnabled && Boolean(course.prices?.length) };
  return { code: 'available', canSelfEnroll: true };
}

module.exports = { catalogAvailability };
