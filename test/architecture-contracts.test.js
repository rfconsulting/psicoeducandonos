const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const docs = path.join(__dirname, '..', 'docs', 'fase-1');
const read = (file) => fs.readFileSync(path.join(docs, file), 'utf8');

test('los contratos separan estados y fuentes de verdad', () => {
  const domain = read('DOMINIO.md');
  assert.match(domain, /Cuenta activa no equivale a perfil aprobado/);
  assert.match(domain, /Perfil aprobado no equivale a matrícula/);
  assert.match(domain, /Pago aprobado no se infiere desde una URL de retorno/);
  for (const state of ['draft', 'submitted', 'under_review', 'changes_requested', 'approved', 'rejected']) {
    assert.match(domain, new RegExp(`\\b${state}\\b`));
  }
});

test('la autorización no bloquea consultas por aprobación estudiantil', () => {
  const access = read('AUTORIZACION.md');
  assert.match(access, /Las consultas no dependen por defecto de `requireApprovedStudent`/);
  assert.match(access, /open \| approved_students \| admin_only/);
});

test('las decisiones críticas quedan registradas y el proveedor sigue pendiente', () => {
  const register = read(path.join('adr', 'README.md'));
  for (let id = 1; id <= 7; id += 1) assert.match(register, new RegExp(`ADR-00${id}`));
  assert.match(read(path.join('adr', 'ADR-007-PROVEEDOR-DE-PAGO.md')), /Estado: pendiente/);
});
