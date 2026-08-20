const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const publicRoot = path.join(__dirname, '..', 'public');

test('las páginas públicas acreditan el desarrollo a RF Consulting', () => {
  for (const file of ['index.html', 'diplomado.html']) {
    const html = fs.readFileSync(path.join(publicRoot, file), 'utf8');
    assert.match(html, /Desarrollado por/);
    assert.match(html, /href="https:\/\/www\.rfcpty\.com\/"/);
    assert.match(html, /target="_blank"/);
    assert.match(html, /rel="noopener noreferrer"/);
    assert.match(html, />RF Consulting<\/a>/);
  }
});
