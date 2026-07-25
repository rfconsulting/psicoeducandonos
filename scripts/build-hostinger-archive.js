const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const INCLUDED_ENTRIES = ['package.json', 'package-lock.json', 'public', 'src', 'scripts', 'database'];
const PRODUCTION_SCRIPTS = new Set([
  'init-database.js',
  'migrate-p0.js',
  'migrate-p1.js',
  'migrate-p2.js',
  'migrate-p3.js',
  'migrate-p4.js',
  'migrate-p5.js',
  'migrate-p6.js',
  'retention.js'
]);
const SECRET_ENV_KEYS = [
  'DB_PASSWORD',
  'SESSION_SECRET',
  'RESEND_API_KEY',
  'MFA_ENCRYPTION_KEY',
  'SUPERUSER_PASSWORD'
];

function secretValues(environment = process.env) {
  return SECRET_ENV_KEYS
    .map(key => String(environment[key] || ''))
    .filter(value => value.length >= 8);
}

function filesUnder(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...filesUnder(target));
    else if (entry.isFile()) files.push(target);
  }
  return files;
}

function assertArtifactSafe(root, knownSecretValues = secretValues()) {
  const findings = [];
  for (const file of filesUnder(root)) {
    const relative = path.relative(root, file);
    const baseName = path.basename(file).toLowerCase();
    if (baseName === '.env' || baseName.startsWith('.env.')) {
      findings.push(`${relative}: archivo de entorno no autorizado`);
      continue;
    }
    if (/\.(png|jpe?g|gif|ico)$/i.test(baseName)) continue;
    const content = fs.readFileSync(file, 'utf8');
    if (/SUPERUSER_PASSWORD/.test(content)) findings.push(`${relative}: credencial de bootstrap`);
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content)) findings.push(`${relative}: clave privada`);
    if (knownSecretValues.some(value => content.includes(value))) findings.push(`${relative}: valor secreto conocido`);
  }
  if (findings.length) {
    throw new Error(`El artefacto contiene material sensible (${findings.length} hallazgo(s); valores omitidos).`);
  }
}

function productionPackage(sourcePackage) {
  const allowedScripts = [
    'start', 'db:init', 'migrate:p0', 'migrate:p1', 'migrate:p2', 'migrate:p3',
    'migrate:p4', 'migrate:p5', 'migrate:p6', 'retention:dry', 'retention:run'
  ];
  return {
    ...sourcePackage,
    scripts: Object.fromEntries(
      allowedScripts
        .filter(name => sourcePackage.scripts?.[name])
        .map(name => [name, sourcePackage.scripts[name]])
    )
  };
}

function buildHostingerArtifact({
  sourceRoot = path.resolve(__dirname, '..'),
  destinationRoot = path.join(sourceRoot, 'artifacts'),
  temporaryParent = os.tmpdir(),
  environment = process.env
} = {}) {
  const stagingRoot = fs.mkdtempSync(path.join(temporaryParent, 'psicoeducandonos-hostinger-'));
  fs.mkdirSync(destinationRoot, { recursive: true });
  const finalRoot = path.join(destinationRoot, `hostinger-${Date.now()}`);
  try {
    fs.mkdirSync(finalRoot, { recursive: false });
    for (const entry of INCLUDED_ENTRIES) {
      fs.cpSync(path.join(sourceRoot, entry), path.join(stagingRoot, entry), {
        recursive: true,
        filter: source => {
          if (/node_modules|\.log$|\.zip$/i.test(source)) return false;
          if (path.basename(path.dirname(source)) === 'scripts' && !PRODUCTION_SCRIPTS.has(path.basename(source))) return false;
          return true;
        }
      });
    }
    const packagePath = path.join(stagingRoot, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    fs.writeFileSync(packagePath, `${JSON.stringify(productionPackage(packageJson), null, 2)}\n`);
    assertArtifactSafe(stagingRoot, secretValues(environment));
    fs.cpSync(stagingRoot, finalRoot, { recursive: true });
    assertArtifactSafe(finalRoot, secretValues(environment));
    return finalRoot;
  } catch (error) {
    fs.rmSync(finalRoot, { recursive: true, force: true });
    throw error;
  } finally {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
  }
}

if (require.main === module) {
  try {
    const artifact = buildHostingerArtifact();
    console.log(`Artefacto seguro creado en: ${artifact}`);
    console.log('Configura las variables de producción externamente; el artefacto no contiene .env.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { assertArtifactSafe, buildHostingerArtifact, productionPackage, secretValues };
