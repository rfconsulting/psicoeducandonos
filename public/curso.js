let csrfToken = '';
let courseModules = [];
let lessonSequence = [];
let selectedLessonId = null;
let currentEnrollment = null;

async function request(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      ...options.headers
    }
  });
  if (response.status === 401) {
    location.replace('/login.html');
    throw new Error('Sesión finalizada.');
  }
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || 'Ocurrió un error.');
    error.details = data;
    throw error;
  }
  return data;
}

function resourceLink(url, label) {
  const link = document.createElement('a');
  link.className = 'lesson-resource';
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = label;
  return link;
}

function renderQuiz(lesson, enrollment, onCompleted) {
  const form = document.createElement('form');
  form.className = 'lesson-quiz';
  const heading = document.createElement('h3');
  heading.textContent = 'Comprueba los puntos clave';
  const intro = document.createElement('p');
  intro.textContent = 'Selecciona una respuesta por pregunta. No tiene puntuación: puedes revisar e intentarlo nuevamente.';
  form.append(heading, intro);

  lesson.questions.forEach(question => {
    const fieldset = document.createElement('fieldset');
    fieldset.dataset.questionPosition = question.position;
    const legend = document.createElement('legend');
    legend.textContent = `${question.position}. ${question.text}`;
    fieldset.appendChild(legend);
    question.options.forEach(option => {
      const label = document.createElement('label');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = `question-${question.id}`;
      radio.value = option.id;
      radio.required = true;
      label.append(radio, document.createTextNode(option.text));
      fieldset.appendChild(label);
    });
    form.appendChild(fieldset);
  });

  const feedback = document.createElement('p');
  feedback.className = 'form-message';
  feedback.setAttribute('role', 'alert');
  const button = document.createElement('button');
  button.type = 'submit';
  button.className = 'submit-button compact-button';
  button.textContent = lesson.completed ? 'Lección completada ✓' : 'Comprobar y completar';
  button.disabled = lesson.completed || !enrollment;
  form.append(feedback, button);

  form.addEventListener('submit', async event => {
    event.preventDefault();
    feedback.className = 'form-message';
    form.querySelectorAll('.needs-review').forEach(item => item.classList.remove('needs-review'));
    const answers = lesson.questions.map(question => ({
      questionId: question.id,
      optionId: Number(new FormData(form).get(`question-${question.id}`))
    }));
    button.disabled = true;
    try {
      const data = await request(`/api/learning/lessons/${lesson.id}/progress`, {
        method: 'PATCH',
        body: JSON.stringify({ answers })
      });
      feedback.className = 'form-message success';
      feedback.textContent = data.message;
      button.textContent = 'Lección completada ✓';
      lesson.completed = true;
      onCompleted();
      if (window.NotificationModal) {
        window.NotificationModal.show({
          type: 'success',
          title: '¡Lección completada!',
          message: 'Tu progreso ha sido guardado correctamente.',
          buttonLabel: 'Continuar'
        });
      }
    } catch (error) {
      feedback.className = 'form-message error';
      feedback.textContent = error.message;
      (error.details?.incorrectQuestions || []).forEach(position => {
        form.querySelector(`[data-question-position="${position}"]`)?.classList.add('needs-review');
      });
      button.disabled = false;
    }
  });
  return form;
}

function selectLesson(lessonId, moveFocus = true) {
  const lesson = lessonSequence.find(item => item.id === lessonId);
  if (!lesson) return;
  selectedLessonId = lesson.id;
  history.replaceState(null, '', `#leccion-${lesson.id}`);
  renderOutline();
  renderSelectedLesson();
  document.querySelector('#course-outline').classList.remove('open');
  document.querySelector('#course-outline-toggle').setAttribute('aria-expanded', 'false');
  if (moveFocus) document.querySelector('#active-lesson-title')?.focus();
}

function renderOutline() {
  const tree = document.querySelector('#course-outline-tree');
  tree.textContent = '';
  courseModules.forEach(module => {
    const group = document.createElement('section');
    group.className = 'outline-module';
    const heading = document.createElement('h3');
    heading.textContent = module.title;
    const progress = document.createElement('span');
    const completed = module.lessons.filter(lesson => lesson.completed).length;
    progress.textContent = `${completed}/${module.lessons.length}`;
    heading.appendChild(progress);
    const list = document.createElement('ol');
    module.lessons.forEach(lesson => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `outline-lesson${lesson.id === selectedLessonId ? ' active' : ''}${lesson.completed ? ' completed' : ''}`;
      if (lesson.id === selectedLessonId) button.setAttribute('aria-current', 'step');
      const title = document.createElement('span');
      title.textContent = lesson.title;
      const state = document.createElement('small');
      state.textContent = lesson.completed ? '✓ Terminada' : 'Pendiente';
      button.append(title, state);
      button.addEventListener('click', () => selectLesson(lesson.id));
      item.appendChild(button);
      list.appendChild(item);
    });
    group.append(heading, list);
    tree.appendChild(group);
  });
}

function lessonNavigation(lesson) {
  const index = lessonSequence.findIndex(item => item.id === lesson.id);
  const navigation = document.createElement('nav');
  navigation.className = 'lesson-navigation';
  navigation.setAttribute('aria-label', 'Navegación entre lecciones');
  const previous = document.createElement('button');
  previous.type = 'button';
  previous.className = 'small-button';
  previous.textContent = '← Lección anterior';
  previous.disabled = index <= 0;
  previous.addEventListener('click', () => selectLesson(lessonSequence[index - 1]?.id));
  const position = document.createElement('span');
  position.textContent = `${index + 1} de ${lessonSequence.length}`;
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'small-button';
  next.textContent = 'Siguiente lección →';
  next.disabled = index >= lessonSequence.length - 1;
  next.addEventListener('click', () => selectLesson(lessonSequence[index + 1]?.id));
  navigation.append(previous, position, next);
  return navigation;
}

function renderSelectedLesson() {
  const workspace = document.querySelector('#lesson-workspace');
  workspace.textContent = '';
  const lesson = lessonSequence.find(item => item.id === selectedLessonId);
  if (!lesson) {
    workspace.className = 'lesson-workspace empty-state';
    workspace.textContent = 'Este curso todavía no contiene lecciones.';
    return;
  }
  workspace.className = 'lesson-workspace';
  const module = courseModules.find(item => item.id === lesson.moduleId);
  const eyebrow = document.createElement('span');
  eyebrow.className = 'lesson-eyebrow';
  eyebrow.textContent = module?.title || 'Lección';
  const title = document.createElement('h2');
  title.id = 'active-lesson-title';
  title.tabIndex = -1;
  title.textContent = lesson.title;
  const meta = document.createElement('div');
  meta.className = 'lesson-meta';
  const duration = document.createElement('span');
  duration.textContent = lesson.estimatedMinutes ? `${lesson.estimatedMinutes} minutos` : 'Duración no indicada';
  const state = document.createElement('span');
  state.className = lesson.completed ? 'lesson-state-completed' : 'lesson-state-pending';
  state.textContent = lesson.completed ? '✓ Lección terminada' : 'Lección pendiente';
  meta.append(duration, state);
  const description = document.createElement('p');
  description.className = 'active-lesson-description';
  description.textContent = lesson.content;
  workspace.append(eyebrow, title, meta, description);

  if (lesson.videoEmbedUrl) {
    const frame = document.createElement('iframe');
    frame.className = 'lesson-video';
    frame.src = lesson.videoEmbedUrl;
    frame.title = `Video: ${lesson.title}`;
    frame.loading = 'lazy';
    frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.allowFullscreen = true;
    workspace.appendChild(frame);
  }
  const resources = document.createElement('div');
  resources.className = 'lesson-resources';
  if (lesson.pdfUrl) resources.appendChild(resourceLink(lesson.pdfUrl, 'Abrir PDF de la lección'));
  if (lesson.slidesUrl) resources.appendChild(resourceLink(lesson.slidesUrl, 'Abrir diapositivas'));
  workspace.appendChild(resources);
  if (lesson.questions.length === 6) {
    workspace.appendChild(renderQuiz(lesson, currentEnrollment, () => {
      renderOutline();
      const status = workspace.querySelector('.lesson-state-pending');
      if (status) {
        status.className = 'lesson-state-completed';
        status.textContent = '✓ Lección terminada';
      }
    }));
  }
  workspace.appendChild(lessonNavigation(lesson));
}

function renderLocked() {
  const shell = document.querySelector('#course-learning-shell');
  shell.className = 'course-learning-shell course-learning-locked';
  shell.textContent = '';
  const notice = document.createElement('section');
  notice.className = 'course-locked';
  const icon = document.createElement('span');
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '🔒';
  const copy = document.createElement('div');
  const title = document.createElement('h2');
  title.textContent = 'Contenido bloqueado';
  const description = document.createElement('p');
  description.textContent = 'Este curso todavía no está asignado a tu perfil. Cuando seas inscrito, aquí encontrarás las lecciones, videos, materiales y actividades.';
  copy.append(title, description);
  notice.append(icon, copy);
  shell.appendChild(notice);
  document.querySelector('#course-outline-toggle').hidden = true;
}

async function init() {
  const id = Number(new URLSearchParams(location.search).get('id'));
  const message = document.querySelector('#course-message');
  try {
    csrfToken = (await request('/api/csrf-token')).csrfToken;
    const { course, enrollment, locked, modules } = await request(`/api/learning/courses/${id}/structure`);
    document.title = `${course.title} · Psicoeducándonos`;
    document.querySelector('#course-title').textContent = course.title;
    document.querySelector('#course-description').textContent = course.description;
    if (locked) {
      renderLocked();
      return;
    }
    currentEnrollment = enrollment;
    courseModules = modules;
    lessonSequence = modules.flatMap(module => module.lessons);
    const hashId = Number(location.hash.replace('#leccion-', ''));
    const hashLesson = lessonSequence.find(lesson => lesson.id === hashId);
    selectedLessonId = hashLesson?.id || lessonSequence.find(lesson => !lesson.completed)?.id || lessonSequence[0]?.id || null;
    renderOutline();
    renderSelectedLesson();
  } catch (error) {
    message.className = 'form-message error';
    message.textContent = error.message;
  }
}

document.querySelector('#course-outline-toggle').addEventListener('click', event => {
  const outline = document.querySelector('#course-outline');
  const expanded = !outline.classList.contains('open');
  outline.classList.toggle('open', expanded);
  event.currentTarget.setAttribute('aria-expanded', String(expanded));
});

init();
