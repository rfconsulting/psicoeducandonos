const fs = require('node:fs/promises');
const path = require('node:path');
const mysql = require('mysql2/promise');
const env = require('../src/config/env');

async function initialize() {
  const sql = await fs.readFile(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8');
  const connection = await mysql.createConnection({ ...env.db, multipleStatements: true });
  try {
    await connection.query(sql);
    console.log('Esquema de base de datos verificado.');
  } finally {
    await connection.end();
  }
}

initialize().catch(error => {
  console.error('No se pudo inicializar la base de datos:', error.message);
  process.exitCode = 1;
});
