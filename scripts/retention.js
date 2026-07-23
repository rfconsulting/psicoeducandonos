const pool = require('../src/config/database');
const env = require('../src/config/env');

async function main() {
  const execute = process.argv.includes('--execute');
  const [tracking] = await pool.execute('SELECT COUNT(*) total FROM student_tracking WHERE updated_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY) AND notes IS NOT NULL', [env.dataRetentionDays]);
  const [audit] = await pool.execute('SELECT COUNT(*) total FROM audit_log WHERE created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)', [env.dataRetentionDays]);
  const [tokens] = await pool.execute(`SELECT
    (SELECT COUNT(*) FROM password_reset_tokens WHERE expires_at<UTC_TIMESTAMP() OR used_at IS NOT NULL) +
    (SELECT COUNT(*) FROM email_verification_tokens WHERE expires_at<UTC_TIMESTAMP() OR used_at IS NOT NULL) AS total`);
  console.log(JSON.stringify({ mode: execute ? 'execute' : 'dry-run', retentionDays: env.dataRetentionDays, trackingNotes: Number(tracking[0].total), auditEvents: Number(audit[0].total), expiredTokens: Number(tokens[0].total) }));
  if (!execute) return;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute('UPDATE student_tracking SET notes=NULL WHERE updated_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)', [env.dataRetentionDays]);
    await connection.execute('DELETE FROM audit_log WHERE created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)', [env.dataRetentionDays]);
    await connection.execute('DELETE FROM password_reset_tokens WHERE expires_at<UTC_TIMESTAMP() OR used_at IS NOT NULL');
    await connection.execute('DELETE FROM email_verification_tokens WHERE expires_at<UTC_TIMESTAMP() OR used_at IS NOT NULL');
    await connection.commit();
    console.log('Política de retención aplicada.');
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>pool.end());
