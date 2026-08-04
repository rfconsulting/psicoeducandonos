function cleanNotes(value) {
  const notes = String(value || '').trim();
  return notes.length <= 5000 ? notes : null;
}

function supportPayload(body = {}) {
  const supervisionNotes = cleanNotes(body.supervisionNotes);
  const practiceNotes = cleanNotes(body.practiceNotes);
  const usesLegacyNames = !Object.hasOwn(body, 'personalWorkCompleted') && !Object.hasOwn(body, 'personalWorkNotes');
  const personalWorkNotes = cleanNotes(usesLegacyNames ? body.therapyNotes : body.personalWorkNotes);
  if ([supervisionNotes, practiceNotes, personalWorkNotes].includes(null)) return null;
  return {
    supervisionCompleted: body.supervisionCompleted === true,
    supervisionNotes,
    practiceCompleted: body.practiceCompleted === true,
    practiceNotes,
    personalWorkCompleted: (usesLegacyNames ? body.therapyAttendance : body.personalWorkCompleted) === true,
    personalWorkNotes
  };
}

function progressPercentage(completedLessons, totalLessons) {
  if (!Number(totalLessons)) return 0;
  return Math.round((Number(completedLessons) / Number(totalLessons)) * 100);
}

module.exports = { cleanNotes, supportPayload, progressPercentage };
