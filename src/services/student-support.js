function completed(value) {
  return value === true || value === 1;
}

function supportStatusForStudent(row = {}) {
  return {
    supervision: completed(row.supervisionCompleted),
    practice: completed(row.practiceCompleted),
    personalWork: completed(row.personalWorkCompleted)
  };
}

module.exports = { supportStatusForStudent };
