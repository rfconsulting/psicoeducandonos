const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('los estilos usan la paleta base del manual de marca', () => {
  for (const file of ['styles.css', 'auth.css']) {
    const css = fs.readFileSync(path.join(root, 'public', file), 'utf8').toLowerCase();
    assert.match(css, /--ink\s*:\s*#0f1a20/);
    assert.match(css, /--cream\s*:\s*#f4f4f4/);
    assert.match(css, /--coral\s*:\s*#0b91ea/);
  }
});

test('el wordmark oficial se aplica sin colorear el punto y coma', () => {
  const asset = path.join(root, 'public', 'assets', 'logo suelto1.jpg');
  assert.equal(fs.existsSync(asset), true);
  for (const file of ['styles.css', 'auth.css']) {
    const css = fs.readFileSync(path.join(root, 'public', file), 'utf8');
    assert.match(css, /logo%20suelto1\.jpg/);
  }
});

test('Literata queda reservada para la jerarquía editorial', () => {
  for (const file of ['styles.css', 'auth.css']) {
    const css = fs.readFileSync(path.join(root, 'public', file), 'utf8');
    assert.match(css, /family=Literata/);
    assert.match(css, /font-family\s*:\s*Literata\s*,\s*serif\s*!important/);
  }
});
