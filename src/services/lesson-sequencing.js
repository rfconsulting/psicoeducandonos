function sequenceLessons(modules, completedLessonIds, enforce = true) {
  const ordered = modules.flatMap(module => module.lessons);
  const firstPending = ordered.findIndex(lesson => !completedLessonIds.has(Number(lesson.id)));
  const unlockedThrough = firstPending === -1 ? ordered.length - 1 : firstPending;
  return modules.map(module => ({
    ...module,
    lessons: module.lessons.map(lesson => {
      const completed = completedLessonIds.has(Number(lesson.id));
      const index = ordered.findIndex(item => Number(item.id) === Number(lesson.id));
      return { ...lesson, completed, locked: enforce && !completed && index > unlockedThrough };
    })
  }));
}

module.exports = { sequenceLessons };
