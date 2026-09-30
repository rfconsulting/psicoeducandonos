let csrfToken = '';
let courseModules = [];
let lessonSequence = [];
let selectedLessonId = null;
let selectedCertificationModuleId = null;
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
  intro.textContent = lesson.completed ? 'Estas son las respuestas que marcaste correctamente al completar la lección.' : 'Selecciona una respuesta por pregunta. No tiene puntuación: puedes revisar e intentarlo nuevamente.';
  form.append(heading, intro);

  if (lesson.completed && lesson.reviewAnswers?.length) {
    form.classList.add('lesson-quiz-review');
    lesson.reviewAnswers.forEach(answer => {
      const fieldset = document.createElement('fieldset');
      const legend = document.createElement('legend');
      legend.textContent = `${answer.questionPosition}. ${answer.questionText}`;
      const selected = document.createElement('p');
      selected.className = 'lesson-review-correct';
      selected.textContent = `✓ Tu respuesta correcta: ${answer.selectedOptionText}`;
      fieldset.append(legend, selected);
      form.appendChild(fieldset);
    });
    return form;
  }

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
      radio.disabled = lesson.completed;
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
      lesson.reviewAnswers = answers.map((answer, index) => {
        const question = lesson.questions[index];
        const selected = question.options.find(option => option.id === answer.optionId);
        return { questionPosition: question.position, questionText: question.text, selectedOptionPosition: selected?.position, selectedOptionText: selected?.text };
      });
      form.querySelectorAll('input').forEach(input => { input.disabled = true; });
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
  if (!lesson || lesson.locked) return;
  selectedLessonId = lesson.id;
  selectedCertificationModuleId = null;
  history.replaceState(null, '', `#leccion-${lesson.id}`);
  renderOutline();
  renderSelectedLesson();
  document.querySelector('#course-outline').classList.remove('open');
  document.querySelector('#course-outline-toggle').setAttribute('aria-expanded', 'false');
  if (moveFocus) document.querySelector('#active-lesson-title')?.focus();
}

function moduleCertificationReady(module){return module.lessons.length>0&&module.lessons.every(lesson=>lesson.completed);}
function moduleCertificationApproved(module){return module.certification.length===3&&module.certification.every(area=>area.certified);}
function moduleCertificationState(module){if(moduleCertificationApproved(module))return'✓ Módulo aprobado';if(module.certification.some(area=>area.answerStatus==='changes_requested'))return'Requiere correcciones';if(module.certification.every(area=>area.answerStatus==='submitted'||area.certified))return'En revisión';return'Disponible';}
function selectModuleCertification(moduleId,moveFocus=true){const module=courseModules.find(item=>item.id===moduleId);if(!module||module.certification.length!==3||!moduleCertificationReady(module))return;selectedLessonId=null;selectedCertificationModuleId=module.id;history.replaceState(null,'',`#certificacion-modulo-${module.id}`);renderOutline();renderModuleClosure(module);document.querySelector('#course-outline').classList.remove('open');document.querySelector('#course-outline-toggle').setAttribute('aria-expanded','false');if(moveFocus)document.querySelector('#active-lesson-title')?.focus();}

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
      button.className = `outline-lesson${lesson.id === selectedLessonId ? ' active' : ''}${lesson.completed ? ' completed' : ''}${lesson.locked ? ' locked' : ''}`;
      button.disabled = lesson.locked;
      if (lesson.id === selectedLessonId) button.setAttribute('aria-current', 'step');
      const title = document.createElement('span');
      title.textContent = lesson.title;
      const state = document.createElement('small');
      state.textContent = lesson.completed ? '✓ Terminada' : lesson.locked ? '🔒 Completa la anterior' : 'Disponible';
      button.append(title, state);
      button.addEventListener('click', () => selectLesson(lesson.id));
      item.appendChild(button);
      list.appendChild(item);
    });
    if(module.certification.length===3){const item=document.createElement('li');const button=document.createElement('button');const ready=moduleCertificationReady(module);const approved=moduleCertificationApproved(module);button.type='button';button.className=`outline-lesson module-closure-step${module.id===selectedCertificationModuleId?' active':''}${approved?' completed':''}${!ready?' locked':''}`;button.disabled=!ready;if(module.id===selectedCertificationModuleId)button.setAttribute('aria-current','step');const title=document.createElement('span');title.textContent='Cierre y certificación del módulo';const state=document.createElement('small');state.textContent=ready?moduleCertificationState(module):'🔒 Completa las lecciones';button.append(title,state);button.addEventListener('click',()=>selectModuleCertification(module.id));item.appendChild(button);list.appendChild(item);}
    group.append(heading, list);
    tree.appendChild(group);
  });
}

function lessonNavigation(lesson) {
  const index = lessonSequence.findIndex(item => item.id === lesson.id);
  const module=courseModules.find(item=>item.id===lesson.moduleId);
  const isLastInModule=module?.lessons[module.lessons.length-1]?.id===lesson.id;
  const hasClosure=isLastInModule&&module.certification.length===3;
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
  next.textContent = hasClosure ? 'Ir al cierre modular →' : 'Siguiente lección →';
  next.disabled = hasClosure ? !moduleCertificationReady(module) : index >= lessonSequence.length - 1 || Boolean(lessonSequence[index + 1]?.locked);
  next.addEventListener('click', () => hasClosure ? selectModuleCertification(module.id) : selectLesson(lessonSequence[index + 1]?.id));
  navigation.append(previous, position, next);
  return navigation;
}

const certificationLabels={supervision:'Supervisión',practice:'Práctica',personal_work:'Trabajo personal'};
function renderModuleCertification(module){
  const section=document.createElement('section');section.className='lesson-quiz module-certification';const heading=document.createElement('h3');heading.textContent='Certificación del módulo';const intro=document.createElement('p');intro.textContent='Responde sobre tu práctica, supervisión y trabajo personal. El profesor revisará cada respuesta.';section.append(heading,intro);
  module.certification.forEach(item=>{const form=document.createElement('form');form.className='certification-answer-form';const label=document.createElement('label');label.textContent=certificationLabels[item.area];const question=document.createElement('p');question.className='certification-question';question.textContent=item.question;const textarea=document.createElement('textarea');textarea.name='answer';textarea.rows=5;textarea.maxLength=10000;textarea.required=true;textarea.value=item.answer||'';textarea.disabled=item.certified;const state=document.createElement('p');state.className=item.certified?'form-message success':'form-message';state.textContent=item.certified?'✓ Certificado por el profesor':item.answerStatus==='changes_requested'?'Requiere correcciones':item.answerStatus==='submitted'?'Enviado para revisión':'Pendiente de envío';const observation=document.createElement('p');observation.className='certification-observation';observation.textContent=item.observation?`Observación del profesor: ${item.observation}`:'';const button=document.createElement('button');button.type='submit';button.className='small-button';button.textContent=item.answer?'Actualizar y enviar':'Enviar respuesta';button.disabled=item.certified;form.append(label,question,textarea,state,observation,button);form.addEventListener('submit',async event=>{event.preventDefault();button.disabled=true;try{const data=await request(`/api/module-certification/modules/${module.id}/answer`,{method:'PATCH',body:JSON.stringify({area:item.area,answer:textarea.value})});item.answer=textarea.value;item.answerStatus='submitted';item.certified=false;state.className='form-message success';state.textContent=data.message;button.textContent='Actualizar y enviar';button.disabled=false;}catch(error){state.className='form-message error';state.textContent=error.message;button.disabled=false;}});section.appendChild(form);});return section;
}

function renderModuleClosure(module){const workspace=document.querySelector('#lesson-workspace');workspace.textContent='';workspace.className='lesson-workspace module-closure-workspace';const eyebrow=document.createElement('span');eyebrow.className='lesson-eyebrow';eyebrow.textContent=module.title;const title=document.createElement('h2');title.id='active-lesson-title';title.tabIndex=-1;title.textContent='Cierre y certificación del módulo';const description=document.createElement('p');description.className='active-lesson-description';description.textContent='Comparte tus impresiones sobre la práctica, la supervisión y el trabajo personal realizados en este módulo.';workspace.append(eyebrow,title,description,renderModuleCertification(module));const navigation=document.createElement('nav');navigation.className='lesson-navigation';navigation.setAttribute('aria-label','Navegación del cierre modular');const previous=document.createElement('button');previous.type='button';previous.className='small-button';previous.textContent='← Última lección';previous.addEventListener('click',()=>selectLesson(module.lessons[module.lessons.length-1]?.id));const position=document.createElement('span');position.textContent=moduleCertificationApproved(module)?'Módulo aprobado':'Cierre modular';const lastIndex=lessonSequence.findIndex(lesson=>lesson.id===module.lessons[module.lessons.length-1]?.id);const nextLesson=lessonSequence[lastIndex+1];const next=document.createElement('button');next.type='button';next.className='small-button';next.textContent='Siguiente módulo →';next.disabled=!nextLesson||Boolean(nextLesson.locked);next.addEventListener('click',()=>selectLesson(nextLesson?.id));navigation.append(previous,position,next);workspace.appendChild(navigation);}

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
      const index = lessonSequence.findIndex(item => item.id === lesson.id);
      if (lessonSequence[index + 1]) lessonSequence[index + 1].locked = false;
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
    const certificationHashId=Number(location.hash.replace('#certificacion-modulo-',''));
    const hashModule=courseModules.find(module=>module.id===certificationHashId&&module.certification.length===3&&moduleCertificationReady(module));
    if(hashModule){selectModuleCertification(hashModule.id,false);return;}
    const hashId = Number(location.hash.replace('#leccion-', ''));
    const hashLesson = lessonSequence.find(lesson => lesson.id === hashId && !lesson.locked);
    const nextStep=courseModules.flatMap(module=>[...module.lessons,{moduleClosure:true,module}]).find(step=>step.moduleClosure?moduleCertificationReady(step.module)&&step.module.certification.some(area=>!area.answer||area.answerStatus==='changes_requested'):!step.completed&&!step.locked);
    selectedLessonId = hashLesson?.id || (!nextStep?.moduleClosure?nextStep?.id:null) || lessonSequence[0]?.id || null;
    if(!hashLesson&&nextStep?.moduleClosure){selectModuleCertification(nextStep.module.id,false);return;}
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
