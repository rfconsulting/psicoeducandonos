function cleanNotes(value) {
  const notes = String(value || '').trim();
  return notes.length <= 5000 ? notes : null;
}

function supportPayload(body = {}) {
  const supervisionNotes = cleanNotes(body.supervisionNotes);
  const practiceNotes = cleanNotes(body.practiceNotes);
  const therapyNotes = cleanNotes(body.therapyNotes);
  if ([supervisionNotes, practiceNotes, therapyNotes].includes(null)) return null;
  return {
    supervisionCompleted: body.supervisionCompleted === true,
    supervisionNotes,
    practiceCompleted: body.practiceCompleted === true,
    practiceNotes,
    therapyAttendance: body.therapyAttendance === true,
    therapyNotes
  };
}

function progressPercentage(completedLessons, totalLessons) {
  if (!Number(totalLessons)) return 0;
  return Math.round((Number(completedLessons) / Number(totalLessons)) * 100);
}

module.exports = { cleanNotes, supportPayload, progressPercentage };
