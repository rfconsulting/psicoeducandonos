const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeCoursePayload,
  courseForManagement
} = require('../src/services/course-management');

function fakeDb(rows) {
  return {
    async execute(sql, values) {
      assert.match(sql, /FROM courses/);
      assert.deepEqual(values, [12]);
      return [rows];
    }
  };
}

test('normaliza los campos editables de un curso', () => {
  assert.deepEqual(normalizeCoursePayload({
    title: '  Curso actualizado  ',
    description: `  ${'Descripción suficiente para el curso.'}  `,
    status: 'published'
  }), {
    title: 'Curso actualizado',
    description: 'Descripción suficiente para el curso.',
    status: 'published'
  });
  assert.equal(normalizeCoursePayload({ title: 'No', description: 'Corta' }), null);
});

test('profesor administra únicamente un curso propio', async () => {
  const own = await courseForManagement(
    fakeDb([{ id: 12, creatorId: 7, status: 'draft' }]),
    { id: 7, role: 'teacher' },
    12
  );
  const foreign = await courseForManagement(
    fakeDb([{ id: 12, creatorId: 8, status: 'draft' }]),
    { id: 7, role: 'teacher' },
    12
  );
  assert.equal(own.id, 12);
  assert.equal(foreign, false);
});

test('administrador y superusuario conservan administración global', async () => {
  for (const role of ['administrator', 'superuser']) {
    const course = await courseForManagement(
      fakeDb([{ id: 12, creatorId: 8, status: 'published' }]),
      { id: 2, role },
      12
    );
    assert.equal(course.id, 12);
  }
});

test('curso inexistente no revela diferencias de autorización', async () => {
  const course = await courseForManagement(fakeDb([]), { id: 7, role: 'teacher' }, 12);
  assert.equal(course, null);
});
