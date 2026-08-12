const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const publicPath = path.join(__dirname, '..', 'public');
const corporate = fs.readFileSync(path.join(publicPath, 'index.html'), 'utf8');
const diploma = fs.readFileSync(path.join(publicPath, 'diplomado.html'), 'utf8');
const styles = fs.readFileSync(path.join(publicPath, 'styles.css'), 'utf8');
const script = fs.readFileSync(path.join(publicPath, 'script.js'), 'utf8');

test('la portada corporativa presenta los dos programas y el acceso a plataforma', () => {
  assert.match(corporate, /Diplomado gratuito/);
  assert.match(corporate, /Taller práctico · 4 semanas/);
  assert.match(corporate, /ansiedad y el pánico/);
  assert.match(corporate, /href="login\.html"/);
});

test('la landing del diplomado permanece en una URL propia y enlazada', () => {
  assert.match(corporate, /href="diplomado\.html"/);
  assert.match(diploma, /https:\/\/psicoeducandonos\.org\/diplomado\.html/);
  assert.match(diploma, /Mapa de las/);
  assert.match(diploma, /href="\/">Psicoeducándonos<\/a>/);
});

test('la propuesta incluye advertencia educativa y adaptación móvil', () => {
  assert.match(corporate, /no sustituyen evaluación, diagnóstico, psicoterapia ni atención de emergencia/);
  assert.match(styles, /@media\(max-width:560px\).*\.corporate-hero/s);
});

test('el script compartido tolera elementos exclusivos de cada landing', () => {
  assert.match(script, /menuButton\?\.addEventListener/);
  assert.match(script, /#calendar-button'\)\?\.addEventListener/);
});
