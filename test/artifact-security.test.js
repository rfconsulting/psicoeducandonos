const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  assertArtifactSafe,
  buildHostingerArtifact
} = require('../scripts/build-hostinger-archive');

function temporaryDirectory(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('rechaza archivos de entorno, bootstrap, claves privadas y secretos conocidos', () => {
  const cases = [
    ['.env', 'NODE_ENV=production'],
    ['config.txt', ['SUPERUSER', 'PASSWORD=NoDebeViajar'].join('_')],
    ['private.pem', ['-----BEGIN', 'PRIVATE KEY-----'].join(' ')],
    ['token.txt', 'known-real-secret-value']
  ];
  for (const [name, content] of cases) {
    const root = temporaryDirectory('artifact-unsafe-');
    try {
      fs.writeFileSync(path.join(root, name), content);
      assert.throws(
        () => assertArtifactSafe(root, ['known-real-secret-value']),
        /material sensible/
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('conserva el artefacto válido y limpia siempre el staging temporal', () => {
  const sourceRoot = temporaryDirectory('artifact-source-');
  const destinationRoot = temporaryDirectory('artifact-output-');
  const temporaryParent = temporaryDirectory('artifact-staging-');
  try {
    for (const directory of ['public', 'src', 'scripts', 'database']) {
      fs.mkdirSync(path.join(sourceRoot, directory));
      fs.writeFileSync(path.join(sourceRoot, directory, 'placeholder.txt'), 'contenido seguro');
    }
    fs.writeFileSync(path.join(sourceRoot, 'scripts', 'init-database.js'), 'console.log("init");');
    fs.writeFileSync(
      path.join(sourceRoot, 'scripts', 'bootstrap-superuser.js'),
      ['SUPERUSER', 'PASSWORD=unsafe'].join('_')
    );
    fs.writeFileSync(path.join(sourceRoot, 'package.json'), JSON.stringify({
      scripts: {
        start: 'node src/server.js',
        prestart: 'node scripts/bootstrap-superuser.js',
        'db:init': 'node scripts/init-database.js'
      }
    }));
    fs.writeFileSync(path.join(sourceRoot, 'package-lock.json'), '{}');

    const artifact = buildHostingerArtifact({
      sourceRoot,
      destinationRoot,
      temporaryParent,
      environment: { SESSION_SECRET: 'known-session-secret' }
    });

    assert.equal(fs.existsSync(artifact), true);
    assert.equal(fs.existsSync(path.join(artifact, '.env')), false);
    assert.equal(fs.existsSync(path.join(artifact, 'scripts', 'bootstrap-superuser.js')), false);
    const packaged = JSON.parse(fs.readFileSync(path.join(artifact, 'package.json'), 'utf8'));
    assert.equal(packaged.scripts.prestart, undefined);
    assert.deepEqual(fs.readdirSync(temporaryParent), []);
  } finally {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
    fs.rmSync(destinationRoot, { recursive: true, force: true });
    fs.rmSync(temporaryParent, { recursive: true, force: true });
  }
});
