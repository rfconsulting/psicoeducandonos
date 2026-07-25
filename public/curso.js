let csrfToken='';
async function request(url,options={}){
  const response=await fetch(url,{credentials:'same-origin',...options,headers:{...(options.body?{'content-type':'application/json'}:{}),...(csrfToken?{'x-csrf-token':csrfToken}:{}),...options.headers}});
  if(response.status===401){location.replace('/login.html');throw new Error('Sesión finalizada.');}
  const data=await response.json();if(!response.ok){const error=new Error(data.error||'Ocurrió un error.');error.details=data;throw error;}return data;
}
function resourceLink(url,label){const link=document.createElement('a');link.className='lesson-resource';link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=label;return link;}
function renderQuiz(lesson,enrollment,message){
  const form=document.createElement('form');form.className='lesson-quiz';
  const heading=document.createElement('h4');heading.textContent='Comprueba los puntos clave';form.appendChild(heading);
  const intro=document.createElement('p');intro.textContent='Selecciona una respuesta por pregunta. No tiene puntuación: puedes revisar e intentarlo nuevamente.';form.appendChild(intro);
  lesson.questions.forEach(question=>{
    const fieldset=document.createElement('fieldset');fieldset.dataset.questionPosition=question.position;
    const legend=document.createElement('legend');legend.textContent=`${question.position}. ${question.text}`;fieldset.appendChild(legend);
    question.options.forEach(option=>{const label=document.createElement('label');const radio=document.createElement('input');radio.type='radio';radio.name=`question-${question.id}`;radio.value=option.id;radio.required=true;label.append(radio,document.createTextNode(option.text));fieldset.appendChild(label);});
    form.appendChild(fieldset);
  });
  const feedback=document.createElement('p');feedback.className='form-message';feedback.setAttribute('role','alert');form.appendChild(feedback);
  const button=document.createElement('button');button.type='submit';button.className='submit-button compact-button';button.textContent=lesson.completed?'Lección completada ✓':'Comprobar y completar';button.disabled=lesson.completed||!enrollment;form.appendChild(button);
  form.addEventListener('submit',async event=>{event.preventDefault();feedback.className='form-message';form.querySelectorAll('.needs-review').forEach(item=>item.classList.remove('needs-review'));const answers=lesson.questions.map(question=>({questionId:question.id,optionId:Number(new FormData(form).get(`question-${question.id}`))}));button.disabled=true;try{const data=await request(`/api/learning/lessons/${lesson.id}/progress`,{method:'PATCH',body:JSON.stringify({answers})});feedback.className='form-message success';feedback.textContent=data.message;button.textContent='Lección completada ✓';lesson.completed=true;}catch(error){feedback.className='form-message error';feedback.textContent=error.message;(error.details?.incorrectQuestions||[]).forEach(position=>form.querySelector(`[data-question-position="${position}"]`)?.classList.add('needs-review'));button.disabled=false;}}
  );
  if(!enrollment){message.textContent='Inscríbete en el curso para registrar el progreso.';}
  return form;
}
function renderLesson(lesson,enrollment,message){
  const article=document.createElement('article');article.className='course-lesson';
  const title=document.createElement('h3');title.textContent=lesson.title;
  const duration=document.createElement('span');duration.className='lesson-duration';duration.textContent=lesson.estimatedMinutes?`${lesson.estimatedMinutes} minutos`:'Duración no indicada';
  const description=document.createElement('p');description.textContent=lesson.content;article.append(title,duration,description);
  if(lesson.videoEmbedUrl){const frame=document.createElement('iframe');frame.className='lesson-video';frame.src=lesson.videoEmbedUrl;frame.title=`Video: ${lesson.title}`;frame.loading='lazy';frame.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';frame.referrerPolicy='strict-origin-when-cross-origin';frame.allowFullscreen=true;article.appendChild(frame);}
  const resources=document.createElement('div');resources.className='lesson-resources';resources.appendChild(resourceLink(lesson.pdfUrl,'Abrir PDF de la lección'));if(lesson.slidesUrl)resources.appendChild(resourceLink(lesson.slidesUrl,'Abrir diapositivas'));article.appendChild(resources);
  if(lesson.questions.length===6)article.appendChild(renderQuiz(lesson,enrollment,message));
  return article;
}
async function init(){
  const id=Number(new URLSearchParams(location.search).get('id'));const message=document.querySelector('#course-message');
  try{csrfToken=(await request('/api/csrf-token')).csrfToken;const {course,enrollment,locked,modules}=await request(`/api/learning/courses/${id}/structure`);document.title=`${course.title} · Psicoeducándonos`;document.querySelector('#course-title').textContent=course.title;document.querySelector('#course-description').textContent=course.description;const list=document.querySelector('#module-list');if(locked){const notice=document.createElement('section');notice.className='course-locked';notice.innerHTML='<span aria-hidden="true">🔒</span><div><h2>Contenido bloqueado</h2><p>Este curso todavía no está asignado a tu perfil. Cuando seas inscrito, aquí encontrarás las lecciones, videos, materiales y actividades.</p></div>';list.appendChild(notice);return;}modules.forEach(module=>{const section=document.createElement('section');section.className='course-module';const heading=document.createElement('h2');heading.textContent=module.title;section.appendChild(heading);module.lessons.forEach(lesson=>section.appendChild(renderLesson(lesson,enrollment,message)));list.appendChild(section);});}
  catch(error){message.className='form-message error';message.textContent=error.message;}
}
init();
