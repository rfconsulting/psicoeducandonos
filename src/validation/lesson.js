function allowedUrl(value, hosts) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' && hosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))
      ? url.toString()
      : '';
  } catch {
    return '';
  }
}

function youtubeUrl(value) {
  return allowedUrl(value, ['youtube.com', 'youtu.be']);
}

function driveUrl(value) {
  return allowedUrl(value, ['drive.google.com']);
}

function youtubeEmbedUrl(value) {
  const normalized = youtubeUrl(value);
  if (!normalized) return '';
  const url = new URL(normalized);
  let id = '';
  if (url.hostname === 'youtu.be') id = url.pathname.split('/').filter(Boolean)[0] || '';
  else if (url.pathname === '/watch') id = url.searchParams.get('v') || '';
  else {
    const match = url.pathname.match(/^\/(?:embed|shorts)\/([A-Za-z0-9_-]{6,20})/);
    id = match?.[1] || '';
  }
  return /^[A-Za-z0-9_-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : '';
}

function normalizeQuestions(value) {
  if (!Array.isArray(value) || value.length !== 6) return null;
  const questions = value.map((question, index) => {
    const text = String(question?.text || '').trim().slice(0, 1000);
    const options = Array.isArray(question?.options)
      ? question.options.map(option => String(option || '').trim().slice(0, 500))
      : [];
    const correctOption = Number(question?.correctOption);
    return { text, options, correctOption, position: index + 1 };
  });
  return questions.every(question =>
    question.text.length >= 5
    && question.options.length === 4
    && question.options.every(option => option.length >= 1)
    && Number.isInteger(question.correctOption)
    && question.correctOption >= 1
    && question.correctOption <= 4
  ) ? questions : null;
}

function evaluateAnswers(correctOptions, answers) {
  if (!Array.isArray(correctOptions) || correctOptions.length !== 6 || !Array.isArray(answers) || answers.length !== 6) return null;
  const submitted = new Map();
  for (const answer of answers) {
    const questionId = Number(answer?.questionId);
    const optionId = Number(answer?.optionId);
    if (!Number.isSafeInteger(questionId) || !Number.isSafeInteger(optionId) || submitted.has(questionId)) return null;
    submitted.set(questionId, optionId);
  }
  return correctOptions
    .filter(correct => submitted.get(Number(correct.questionId)) !== Number(correct.optionId))
    .map(correct => Number(correct.position));
}

function questionForClient(question, options, includeCorrect = false) {
  const questionOptions = options.filter(option => Number(option.questionId) === Number(question.id));
  return {
    ...question,
    ...(includeCorrect ? { correctOption: questionOptions.find(option => Boolean(option.isCorrect))?.position || null } : {}),
    options: questionOptions.map(option => ({
      id: option.id,
      questionId: option.questionId,
      text: option.text,
      position: option.position
    }))
  };
}

module.exports = {
  youtubeUrl,
  driveUrl,
  youtubeEmbedUrl,
  normalizeQuestions,
  evaluateAnswers,
  questionForClient
};
