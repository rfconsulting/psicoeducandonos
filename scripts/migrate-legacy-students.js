const pool = require('../src/config/database');
const { legacyProfileValues, missingProfileFields, fieldsToImport } = require('../src/services/legacy-student-migration');

const execute = process.argv.includes('--execute');

async function loadCandidates(connection) {
  const [rows] = await connection.query(`
    SELECT a.id AS application_id,a.user_id AS linked_user_id,a.email,a.phone,a.location,a.pathway,
      a.motivation,a.status,a.privacy_consent,u.id AS email_user_id,u.role AS email_user_role,
      linked.role AS linked_user_role,m.application_id AS migrated_application_id,
      sp.user_id AS profile_user_id,sp.phone AS profile_phone,sp.country AS profile_country,
      sp.city AS profile_city,sp.birth_date AS profile_birth_date,sp.document_type AS profile_document_type,
      sp.document_number AS profile_document_number,sp.profession AS profile_profession,
      sp.education_level AS profile_education_level,sp.pathway AS profile_pathway,
      sp.motivation AS profile_motivation,sp.license_number AS profile_license_number,
      sp.review_status AS profile_review_status
    FROM applications a
    LEFT JOIN users linked ON linked.id=a.user_id
    LEFT JOIN users u ON LOWER(u.email)=LOWER(a.email)
    LEFT JOIN student_profiles sp ON sp.user_id=COALESCE(a.user_id,u.id)
    LEFT JOIN legacy_student_profile_migrations m ON m.application_id=a.id
    ORDER BY a.created_at DESC,a.id DESC`);
  return rows;
}

function currentProfile(row) {
  if (!row.profile_user_id) return null;
  return Object.fromEntries(Object.entries(row)
    .filter(([key]) => key.startsWith('profile_'))
    .map(([key, value]) => [key.slice(8), value]));
}

function resolveCandidate(row, claimedUsers) {
  if (row.migrated_application_id) {
    const migratedUserId = row.linked_user_id || row.email_user_id;
    if (migratedUserId) claimedUsers.add(String(migratedUserId));
    return { outcome: 'alreadyMigrated', userId: migratedUserId };
  }
  if (row.status === 'rejected') return { outcome: 'ineligible', reason: 'rejected_application' };
  if (row.linked_user_id && row.linked_user_role !== 'student') return { outcome: 'conflicts', reason: 'linked_non_student' };
  if (!row.linked_user_id && row.email_user_id && row.email_user_role !== 'student') return { outcome: 'conflicts', reason: 'email_non_student' };
  const userId = row.linked_user_id || row.email_user_id;
  if (!userId) return { outcome: 'unmatched', reason: 'student_account_not_found' };
  if (claimedUsers.has(String(userId))) return { outcome: 'duplicates', reason: 'newer_application_selected', userId };
  claimedUsers.add(String(userId));
  return { outcome: 'ready', userId };
}

async function migrateOne(connection, row, userId, fields) {
  const legacy = legacyProfileValues(row);
  await connection.execute('INSERT IGNORE INTO student_profiles (user_id) VALUES (?)', [userId]);
  if (fields.length) {
    await connection.execute(
      `UPDATE student_profiles SET ${fields.map(field => `${field}=?`).join(',')} WHERE user_id=?`,
      [...fields.map(field => legacy[field]), userId]
    );
  }
  await connection.execute('UPDATE applications SET user_id=? WHERE id=? AND user_id IS NULL', [userId, row.application_id]);
  await connection.execute(
    'INSERT INTO legacy_student_profile_migrations (application_id,user_id,imported_fields,legacy_status) VALUES (?,?,?,?)',
    [row.application_id, userId, JSON.stringify(fields), row.status]
  );
  await connection.execute(
    `INSERT INTO audit_log (actor_user_id,action,target_type,target_id,details)
     VALUES (NULL,'legacy_student_profile_migrated','student_profile',?,?)`,
    [userId, JSON.stringify({ applicationId: row.application_id, legacyStatus: row.status, importedFields: fields })]
  );
}

async function main() {
  const connection = await pool.getConnection();
  const report = { mode: execute ? 'execute' : 'dry-run', ready: [], alreadyMigrated: [], ineligible: [], unmatched: [], conflicts: [], duplicates: [] };
  try {
    await connection.beginTransaction();
    const rows = await loadCandidates(connection);
    const claimedUsers = new Set();
    for (const row of rows) {
      const resolution = resolveCandidate(row, claimedUsers);
      if (resolution.outcome !== 'ready') {
        report[resolution.outcome].push({ applicationId: row.application_id, email: row.email, userId: resolution.userId, reason: resolution.reason });
        continue;
      }
      const profile = currentProfile(row);
      const fields = fieldsToImport(profile, row);
      const projected = { ...(profile || {}), ...Object.fromEntries(fields.map(field => [field, legacyProfileValues(row)[field]])) };
      const item = { applicationId: row.application_id, userId: resolution.userId, email: row.email,
        legacyStatus: row.status, importedFields: fields, missingFields: missingProfileFields(projected) };
      report.ready.push(item);
      if (execute) await migrateOne(connection, row, resolution.userId, fields);
    }
    if (execute) await connection.commit();
    else await connection.rollback();
    report.counts = Object.fromEntries(['ready', 'alreadyMigrated', 'ineligible', 'unmatched', 'conflicts', 'duplicates'].map(key => [key, report[key].length]));
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch(error => {
  console.error(`No se pudo migrar estudiantes: ${error.message}`);
  process.exitCode = 1;
});
