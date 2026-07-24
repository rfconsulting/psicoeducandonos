class EmailDeliveryError extends Error {
  constructor(message, { code = 'email_delivery_failed', temporary = false, cause } = {}) {
    super(message, { cause });
    this.name = 'EmailDeliveryError';
    this.code = code;
    this.temporary = temporary;
  }
}

module.exports = { EmailDeliveryError };
