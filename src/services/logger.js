function write(level, message, fields = {}) {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...fields
  });
  (level === 'error' ? console.error : console.log)(entry);
}

module.exports = {
  info: (message, fields) => write('info', message, fields),
  warn: (message, fields) => write('warn', message, fields),
  error: (message, fields) => write('error', message, fields)
};
