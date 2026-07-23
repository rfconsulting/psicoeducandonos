const mysql = require('mysql2/promise');
const env = require('./env');

const pool = mysql.createPool({
  ...env.db,
  waitForConnections: true,
  queueLimit: 0,
  enableKeepAlive: true,
  timezone: 'Z',
  namedPlaceholders: false
});

module.exports = pool;
