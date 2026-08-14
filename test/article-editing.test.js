const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { driveDownloadUrl } = require('../src/validation/lesson');

test('convierte un archivo de Drive en enlace directo de descarga', () => {
  assert.equal(driveDownloadUrl('https://drive.google.com/file/d/AbCdEfGhIjKlMn123/view?usp=sharing'), 'https://drive.google.com/uc?export=download&id=AbCdEfGhIjKlMn123');
  assert.equal(driveDownloadUrl('https://example.com/documento.pdf'), '');
});

test('la edición exige autoría o administración global y audita el cambio', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/content.js'), 'utf8');
  assert.match(source, /patch\('\/articles\/:id'/i);
  assert.match(source, /ARTICLE_MANAGE_ALL/);
  assert.match(source, /article\.authorId/);
  assert.match(source, /article_updated/);
});

test('listado y lector muestran descarga PDF sin insertar HTML dinámico', () => {
  const dashboard = fs.readFileSync(path.join(__dirname, '../public/dashboard.js'), 'utf8');
  const reader = fs.readFileSync(path.join(__dirname, '../public/articulo.js'), 'utf8');
  assert.match(dashboard, /Editar artículo/);
  assert.match(dashboard, /Descargar PDF/);
  assert.match(reader, /article-pdf/);
  assert.doesNotMatch(reader, /innerHTML/);
});
