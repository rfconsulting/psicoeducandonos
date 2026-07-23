const bcrypt = require('bcryptjs');
const pool = require('../src/config/database');
const { cleanName, normalizeEmail, validEmail, validPassword } = require('../src/validation/auth');

async function main() {
  const fullName = cleanName(process.env.SUPERUSER_NAME);
  const email = normalizeEmail(process.env.SUPERUSER_EMAIL);
  const password = String(process.env.SUPERUSER_PASSWORD || '');
  if (fullName.length < 3 || !validEmail(email) || password.length < 16 || !validPassword(password)) {
    throw new Error('Configura nombre, correo válido y una contraseña segura de al menos 16 caracteres.');
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.execute('SELECT id,role FROM users WHERE email=? FOR UPDATE', [email]);
    const hash = await bcrypt.hash(password, 12);
    if (existing[0] && existing[0].role !== 'superuser') {
      throw new Error('El correo pertenece a una cuenta que no es superusuario. No se realizó ninguna promoción.');
    }
    if (existing[0]) {
      await connection.execute(
        "UPDATE users SET full_name=?,password_hash=?,status='active',must_change_password=FALSE,email_verified_at=UTC_TIMESTAMP(),auth_version=auth_version+1,password_changed_at=UTC_TIMESTAMP() WHERE id=? AND role='superuser'",
        [fullName, hash, existing[0].id]
      );
    } else {
      await connection.execute(
        "INSERT INTO users (full_name,email,password_hash,role,must_change_password,email_verified_at) VALUES (?,?,?,'superuser',FALSE,UTC_TIMESTAMP())",
        [fullName, email, hash]
      );
    }
    await connection.commit();
    console.log('Superusuario creado o actualizado correctamente. Retira sus variables del entorno cuando termines.');
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => pool.end());
