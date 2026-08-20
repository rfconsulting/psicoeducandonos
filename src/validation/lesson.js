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

function driveDownloadUrl(value) {
  const normalized = driveUrl(value);
  if (!normalized) return '';
  const url = new URL(normalized);
  const fileId = url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]+)/)?.[1] || url.searchParams.get('id');
  return fileId && /^[A-Za-z0-9_-]{10,}$/.test(fileId) ? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}` : '';
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

function lessonQuestionsValidationError(value) {
  if (!Array.isArray(value) || value.length !== 6) return 'La lección debe contener exactamente seis preguntas.';
  for (let index = 0; index < value.length; index += 1) {
    const number = index + 1;
    const question = value[index];
    if (String(question?.text || '').trim().length < 5) return `La pregunta ${number} debe contener al menos cinco caracteres.`;
    if (!Array.isArray(question?.options) || question.options.length !== 4) return `La pregunta ${number} debe contener exactamente cuatro opciones.`;
    const emptyOption = question.options.findIndex(option => String(option || '').trim().length < 1);
    if (emptyOption >= 0) return `Completa la opción ${emptyOption + 1} de la pregunta ${number}.`;
    const correctOption = Number(question?.correctOption);
    if (!Number.isInteger(correctOption) || correctOption < 1 || correctOption > 4) return `Selecciona la opción correcta de la pregunta ${number}.`;
  }
  return '';
}

function lessonInputValidationError({ resourceId, title, content, position, estimatedMinutes, videoUrl, pdfUrl, slidesUrl, questions }) {
  if (!Number.isSafeInteger(resourceId) || resourceId < 1) return 'El módulo o la lección seleccionada no es válido.';
  if (String(title || '').trim().length < 3) return 'El título debe contener al menos tres caracteres.';
  if (String(content || '').trim().length < 10) return 'La descripción debe contener al menos diez caracteres.';
  if (!Number.isInteger(position) || position < 1 || position > 1000) return 'La posición debe ser un número entre 1 y 1000.';
  if (estimatedMinutes !== null && (!Number.isInteger(estimatedMinutes) || estimatedMinutes < 1 || estimatedMinutes > 1440)) return 'La duración debe ser un número entre 1 y 1440 minutos.';
  if (!youtubeUrl(videoUrl)) return 'El video debe ser un enlace HTTPS válido de YouTube.';
  if (!driveUrl(pdfUrl)) return 'El PDF debe ser un enlace HTTPS válido de Google Drive.';
  if (slidesUrl && !driveUrl(slidesUrl)) return 'Las diapositivas deben ser un enlace HTTPS válido de Google Drive.';
  return lessonQuestionsValidationError(questions);
}

function normalizeQuestions(value) {
  if (lessonQuestionsValidationError(value)) return null;
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
  driveDownloadUrl,
  youtubeEmbedUrl,
  lessonInputValidationError,
  lessonQuestionsValidationError,
  normalizeQuestions,
  evaluateAnswers,
  questionForClient
};
