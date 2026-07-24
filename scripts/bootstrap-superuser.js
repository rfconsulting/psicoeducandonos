const bcrypt = require('bcryptjs');
const pool = require('../src/config/database');
const { cleanName, normalizeEmail, validEmail, validPassword } = require('../src/validation/auth');

async function main() {
  const [existing] = await pool.execute("SELECT id FROM users WHERE role='superuser' LIMIT 1");
  if (existing.length) {
    console.log('Bootstrap de superusuario omitido: ya existe una cuenta.');
    return;
  }

  const fullName = cleanName(process.env.SUPERUSER_NAME);
  const email = normalizeEmail(process.env.SUPERUSER_EMAIL);
  const password = String(process.env.SUPERUSER_PASSWORD || '');
  if (fullName.length < 3 || !validEmail(email) || password.length < 16 || !validPassword(password)) {
    throw new Error('El bootstrap inicial del superusuario no está configurado correctamente.');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await pool.execute(
    `INSERT INTO users
     (full_name,email,password_hash,role,status,must_change_password,email_verified_at)
     VALUES (?,?,?,'superuser','active',TRUE,UTC_TIMESTAMP())`,
    [fullName, email, passwordHash]
  );
  console.log('Superusuario inicial creado. Deberá cambiar su contraseña al ingresar.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => pool.end());
