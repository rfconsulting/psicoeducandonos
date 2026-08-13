const TRANSITIONS = Object.freeze({
  start_review: Object.freeze({ from: ['submitted'], to: 'under_review' }),
  request_changes: Object.freeze({ from: ['under_review'], to: 'changes_requested', notesRequired: true }),
  approve: Object.freeze({ from: ['under_review'], to: 'approved' }),
  reject: Object.freeze({ from: ['under_review'], to: 'rejected', notesRequired: true }),
  reopen: Object.freeze({ from: ['approved', 'rejected'], to: 'under_review', notesRequired: true })
});

function reviewTransition(currentStatus, decision, notes) {
  const rule = TRANSITIONS[decision];
  const cleanNotes = String(notes || '').trim();
  if (!rule || !rule.from.includes(currentStatus)) return null;
  if (rule.notesRequired && cleanNotes.length < 10) return null;
  if (cleanNotes.length > 5000) return null;
  return { fromStatus: currentStatus, decision, toStatus: rule.to, notes: cleanNotes || null };
}

module.exports = { TRANSITIONS, reviewTransition };
