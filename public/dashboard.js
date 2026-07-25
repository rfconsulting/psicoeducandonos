const roleNames={superuser:'Superusuario',administrator:'Administrador',writer:'Escritor',teacher:'Profesor',student:'Estudiante'};
const articleRoles=['superuser','administrator','writer','teacher'];
const courseRoles=['superuser','administrator','teacher'];
const trackingRoles=['superuser','administrator','teacher'];
let currentUser=null;let csrfToken='';
let auditCursor=null;
let applicationsCursor=null;

const activityNames={
  login_succeeded:'Inicio de sesión',login_failed:'Intento de acceso fallido',logout:'Cierre de sesión',user_created:'Usuario creado',
  user_role_changed:'Rol de usuario actualizado',user_status_changed:'Estado de usuario actualizado',
  user_password_reset_by_superuser:'Contraseña restablecida por superusuario',
  article_created:'Artículo creado',course_created:'Curso creado',
  course_module_created:'Módulo creado',lesson_created:'Lección creada',
  student_enrolled:'Estudiante inscrito',student_tracking_updated:'Seguimiento actualizado',
  enrollment_support_updated:'Acompañamiento de matrícula actualizado',
  lesson_progress_updated:'Progreso de lección actualizado',password_changed:'Contraseña actualizada',
  password_reset_requested:'Recuperación solicitada',password_reset_delivery_unconfigured:'Recuperación sin proveedor de correo',
  password_reset_delivery_failed:'Fallo al entregar recuperación',password_reset_completed:'Contraseña restablecida',
  mfa_verified:'Verificación MFA completada',
  application_submitted:'Postulación recibida',application_reviewed:'Postulación revisada',
  student_account_created_from_application:'Cuenta estudiantil creada desde postulación'
};

function setupNavigation(){
  const buttons=[...document.querySelectorAll('[data-panel-target]')];
  const panels=[...document.querySelectorAll('.dashboard-panel')];
  buttons.forEach(button=>button.addEventListener('click',()=>{
    panels.forEach(panel=>{panel.hidden=panel.id!==button.dataset.panelTarget;});
    buttons.forEach(item=>item.classList.toggle('active',item===button));
    history.replaceState(null,'',`#${button.dataset.panelTarget}`);
    document.querySelector('.dashboard-content').scrollTo({top:0,behavior:'smooth'});
  }));
}
function openHashPanel(){const id=location.hash.slice(1);if(!id)return;const button=document.querySelector(`[data-panel-target="${CSS.escape(id)}"]:not([hidden])`);if(button)button.click();}

async function request(url,options={}){
  const response=await fetch(url,{credentials:'same-origin',...options,headers:{...(options.body?{'content-type':'application/json'}:{}),...(csrfToken?{'x-csrf-token':csrfToken}:{}),...options.headers}});
  if(response.status===401){window.location.replace('/login.html');throw new Error('Sesión finalizada.')}
  const data=await response.json();if(data.code==='MFA_REQUIRED'){window.location.replace('/mfa.html');throw new Error(data.error);}if(data.code==='PASSWORD_CHANGE_REQUIRED'){window.location.replace('/cambiar-password.html');throw new Error(data.error);}if(!response.ok)throw new Error(data.error||'Ocurrió un error.');return data;
}

function renderItems(containerId,items,type){
  const container=document.querySelector(containerId);container.textContent='';
  if(!items.length){const empty=document.createElement('p');empty.className='empty-state';empty.textContent=type==='article'?'Todavía no hay artículos disponibles.':'Todavía no hay cursos disponibles.';container.appendChild(empty);return;}
  items.forEach(item=>{const card=document.createElement('article');card.className='content-card';const eyebrow=document.createElement('span');const created=type==='article'&&item.createdAt?` · ${new Intl.DateTimeFormat('es',{dateStyle:'medium'}).format(new Date(item.createdAt))}`:'';eyebrow.textContent=`${item.status==='published'?'Publicado':'Borrador'} · ${type==='article'?item.author:item.creator}${created}`;const title=document.createElement('h3');title.textContent=item.title;const copy=document.createElement('p');copy.textContent=type==='article'?item.summary:item.description;card.append(eyebrow,title,copy);if(type==='article'){const link=document.createElement('a');link.className='content-link';link.href=`/articulo.html?slug=${encodeURIComponent(item.slug)}`;link.textContent='Leer artículo →';card.appendChild(link);}container.appendChild(card);});
}
async function loadContent(){const [{articles},{courses}]=await Promise.all([request('/api/content/articles'),request('/api/content/courses')]);renderItems('#articles-list',articles,'article');renderItems('#courses-list',courses,'course');document.querySelectorAll('.course-selector').forEach(select=>{select.textContent='';courses.filter(course=>['superuser','administrator'].includes(currentUser.role)||course.creatorId===currentUser.id).forEach(course=>{const option=document.createElement('option');option.value=course.id;option.textContent=course.title;select.appendChild(option);});});}

async function loadDashboardStatistics(){
  const section=document.querySelector('#dashboard-statistics');const grid=document.querySelector('#statistics-grid');const coursesList=document.querySelector('#course-statistics-list');const message=document.querySelector('#statistics-message');section.hidden=false;grid.textContent='';coursesList.textContent='';message.textContent='';
  try{
    const {totals,courses}=await request('/api/dashboard/statistics');
    [['Estudiantes inscritos',totals.enrolledStudents],['Postulaciones pendientes',totals.pendingApplications],['Cursos creados',totals.coursesCreated],['Artículos creados',totals.articlesCreated],['Profesores',totals.teachers],['Escritores',totals.writers]].forEach(([label,value])=>{const card=document.createElement('article');card.className='statistic-card';const name=document.createElement('span');name.textContent=label;const count=document.createElement('strong');count.textContent=Number(value)||0;card.append(name,count);grid.appendChild(card);});
    if(!courses.length){const empty=document.createElement('p');empty.className='empty-state';empty.textContent='Todavía no hay cursos creados.';coursesList.appendChild(empty);}
    courses.forEach(course=>{const row=document.createElement('div');row.className='course-statistic-row';const identity=document.createElement('div');const title=document.createElement('strong');title.textContent=course.title;const status=document.createElement('small');status.textContent=course.status==='published'?'Publicado':'Borrador';identity.append(title,status);const count=document.createElement('span');count.textContent=Number(course.enrolledStudents)||0;count.setAttribute('aria-label',`${count.textContent} estudiantes inscritos`);row.append(identity,count);coursesList.appendChild(row);});
  }catch(error){message.className='form-message error';message.textContent=error.message;}
}

function bindEditor(formId,url){
  const form=document.querySelector(formId);
  form.addEventListener('submit',async(event)=>{event.preventDefault();const message=form.querySelector('.form-message');const button=form.querySelector('button[type="submit"]');const values=Object.fromEntries(new FormData(form));values.status=values.publish?'published':'draft';delete values.publish;button.disabled=true;message.className='form-message';try{const data=await request(url,{method:'POST',body:JSON.stringify(values)});message.classList.add('success');message.textContent=data.message;form.reset();await loadContent();}catch(error){message.classList.add('error');message.textContent=error.message;}finally{button.disabled=false;}});
}

async function loadUsers(){
  const {users}=await request('/api/users');const body=document.querySelector('#users-body');body.textContent='';
  users.forEach(user=>{const row=document.createElement('tr');const roleControl=currentUser.role==='superuser'&&user.role!=='superuser'?`<select data-role-id="${user.id}">${['administrator','writer','teacher','student'].map(role=>`<option value="${role}" ${user.role===role?'selected':''}>${roleNames[role]}</option>`).join('')}</select>`:roleNames[user.role];const canSuspend=user.role!=='superuser'&&user.id!==currentUser.id;row.innerHTML=`<td></td><td></td><td>${roleControl}</td><td>${user.status==='active'?'Activo':'Suspendido'}</td><td>${canSuspend?`<button class="small-button" data-status-id="${user.id}" data-status="${user.status==='active'?'suspended':'active'}">${user.status==='active'?'Suspender':'Activar'}</button>`:'—'}</td>`;row.children[0].textContent=user.fullName;row.children[1].textContent=user.email;if(currentUser.role==='superuser'&&user.role!=='superuser'){const reset=document.createElement('button');reset.type='button';reset.className='small-button';reset.textContent='Restablecer contraseña';reset.addEventListener('click',()=>openPasswordDialog(user));row.children[4].appendChild(reset);}body.appendChild(row);});
  document.querySelectorAll('[data-role-id]').forEach(control=>control.addEventListener('change',()=>updateUser(control.dataset.roleId,'role',control.value)));
  document.querySelectorAll('[data-status-id]').forEach(button=>button.addEventListener('click',()=>updateUser(button.dataset.statusId,'status',button.dataset.status)));
}

async function loadAudit(reset=false){
  const message=document.querySelector('#audit-message');const body=document.querySelector('#audit-body');const more=document.querySelector('#audit-more');
  if(reset){auditCursor=null;body.textContent='';}
  more.disabled=true;message.className='form-message';message.textContent='';
  try{
    const query=new URLSearchParams({limit:'30'});
    new FormData(document.querySelector('#audit-filters')).forEach((value,key)=>{if(String(value).trim())query.set(key,String(value).trim());});
    if(auditCursor)query.set('cursor',auditCursor);
    const {activities,nextCursor}=await request(`/api/audit-log?${query}`);
    if(!activities.length&&!body.children.length){message.textContent='Todavía no hay actividades registradas.';}
    activities.forEach(activity=>{
      const row=document.createElement('tr');
      const responsible=activity.actorName?`${activity.actorName} · ${activity.actorEmail}`:'Sistema o usuario eliminado';
      const target=activity.targetType?`${activity.targetType}${activity.targetId?` #${activity.targetId}`:''}`:'—';
      row.innerHTML='<td></td><td></td><td></td><td></td><td></td>';
      row.children[0].textContent=new Intl.DateTimeFormat('es',{dateStyle:'medium',timeStyle:'short'}).format(new Date(activity.createdAt));
      row.children[1].textContent=activityNames[activity.action]||activity.action.replaceAll('_',' ');
      row.children[2].textContent=responsible;
      row.children[3].textContent=activity.actorRole?roleNames[activity.actorRole]||activity.actorRole:'—';
      row.children[4].textContent=target;
      body.appendChild(row);
    });
    auditCursor=nextCursor;more.hidden=!nextCursor;
  }catch(error){message.className='form-message error';message.textContent=error.message;}finally{more.disabled=false;}
}

const applicationStatuses={pending:'Pendiente',reviewing:'En revisión',approved:'Aprobada',waitlisted:'Lista de espera',rejected:'Rechazada'};
async function loadApplications(reset=false){
  const list=document.querySelector('#applications-list');const message=document.querySelector('#applications-message');const more=document.querySelector('#applications-more');
  if(reset){applicationsCursor=null;list.textContent='';}more.disabled=true;message.className='form-message';message.textContent='';
  try{
    const query=new URLSearchParams({limit:'30'});new FormData(document.querySelector('#application-filters')).forEach((value,key)=>{if(String(value).trim())query.set(key,String(value).trim());});if(applicationsCursor)query.set('cursor',applicationsCursor);
    const {applications,nextCursor}=await request(`/api/applications?${query}`);
    if(!applications.length&&!list.children.length)message.textContent='No hay postulaciones con estos filtros.';
    applications.forEach(application=>list.appendChild(applicationCard(application)));
    applicationsCursor=nextCursor;more.hidden=!nextCursor;
  }catch(error){message.className='form-message error';message.textContent=error.message;}finally{more.disabled=false;}
}
function applicationCard(application){
  const form=document.createElement('form');form.className='application-review';form.dataset.applicationId=application.id;
  form.innerHTML='<div class="application-person"><span></span><h3></h3><p class="application-contact"></p><div class="application-badges"></div></div><div class="application-answer"><strong>Motivación</strong><p></p></div><div class="application-answer feedback-answer" hidden><strong>Clase informativa</strong><p></p></div><div class="form-grid"><div class="field"><label>Estado</label><select name="status"></select></div><div class="field"><label>Observaciones internas</label><textarea name="reviewNotes" rows="4" maxlength="5000"></textarea></div></div><p class="form-message"></p><button class="small-button" type="submit">Guardar revisión</button>';
  form.querySelector('.application-person>span').textContent=new Intl.DateTimeFormat('es',{dateStyle:'medium'}).format(new Date(application.createdAt));
  form.querySelector('h3').textContent=application.fullName;form.querySelector('.application-contact').textContent=`${application.email} · ${application.phone} · ${application.location}`;
  const badges=form.querySelector('.application-badges');['pathway','ageRange','crisisExperience'].forEach(key=>{const badge=document.createElement('span');badge.textContent=key==='pathway'?(application[key]==='accompaniment'?'Acompañamiento':'Profesional de salud'):key==='crisisExperience'?(application[key]?'Con experiencia':'Sin experiencia'):application[key];badges.appendChild(badge);});
  if(application.userId){const linked=document.createElement('span');linked.textContent='Cuenta estudiantil vinculada';badges.appendChild(linked);}
  form.querySelector('.application-answer p').textContent=application.motivation;
  if(application.attendedInfoSession){const feedback=form.querySelector('.feedback-answer');feedback.hidden=false;feedback.querySelector('p').textContent=application.sessionFeedback||'Participó, sin comentario adicional.';}
  const select=form.elements.status;Object.entries(applicationStatuses).forEach(([value,label])=>{const option=document.createElement('option');option.value=value;option.textContent=label;select.appendChild(option);});select.value=application.status;form.elements.reviewNotes.value=application.reviewNotes||'';
  form.addEventListener('submit',saveApplicationReview);return form;
}
async function saveApplicationReview(event){
  event.preventDefault();const form=event.currentTarget;const message=form.querySelector('.form-message');const button=form.querySelector('button[type="submit"]');const values=Object.fromEntries(new FormData(form));button.disabled=true;
  try{const data=await request(`/api/applications/${form.dataset.applicationId}/review`,{method:'PATCH',body:JSON.stringify(values)});await loadApplications(true);const globalMessage=document.querySelector('#applications-message');globalMessage.className='form-message success';globalMessage.textContent=data.message;}catch(error){message.className='form-message error';message.textContent=error.message;}finally{button.disabled=false;}
}
async function updateUser(id,field,value){const message=document.querySelector('#admin-message');try{await request(`/api/users/${id}/${field}`,{method:'PATCH',body:JSON.stringify({[field]:value})});message.className='form-message success';message.textContent='Usuario actualizado.';await loadUsers();}catch(error){message.className='form-message error';message.textContent=error.message;}}

function openPasswordDialog(user){
  const dialog=document.querySelector('#password-dialog');const form=document.querySelector('#admin-password-form');
  form.reset();form.elements.userId.value=user.id;form.querySelector('.form-message').textContent='';
  document.querySelector('#password-user-name').textContent=`${user.fullName} (${user.email})`;
  dialog.showModal();form.elements.temporaryPassword.focus();
}

function setupPasswordReset(){
  const dialog=document.querySelector('#password-dialog');const form=document.querySelector('#admin-password-form');
  document.querySelector('#password-cancel').addEventListener('click',()=>dialog.close());
  form.addEventListener('submit',async event=>{
    event.preventDefault();const values=Object.fromEntries(new FormData(form));const message=form.querySelector('.form-message');const button=form.querySelector('button[type="submit"]');
    message.className='form-message';
    if(values.temporaryPassword!==values.confirmation){message.classList.add('error');message.textContent='Las contraseñas no coinciden.';return;}
    button.disabled=true;
    try{
      const data=await request(`/api/users/${values.userId}/password`,{method:'PATCH',body:JSON.stringify({temporaryPassword:values.temporaryPassword})});
      dialog.close();const adminMessage=document.querySelector('#admin-message');adminMessage.className='form-message success';adminMessage.textContent=data.message;
    }catch(error){message.classList.add('error');message.textContent=error.message;}finally{button.disabled=false;}
  });
}

let selectedTrackingStudentId=null;
function addFact(container,label,value){if(value===null||value===undefined||value==='')return;const fact=document.createElement('div');fact.className='profile-fact';const name=document.createElement('strong');name.textContent=label;const content=document.createElement('span');content.textContent=value;fact.append(name,content);container.appendChild(fact);}
function displayDate(value){return value?new Intl.DateTimeFormat('es',{dateStyle:'medium'}).format(new Date(value)):'Sin registro';}
async function loadTracking(){
  const filters=new URLSearchParams(new FormData(document.querySelector('#tracking-filters')));const selectedCourse=document.querySelector('#tracking-course').value;
  const {students,courses,enrollmentCandidates}=await request(`/api/users/students/tracking?${filters}`);const list=document.querySelector('#tracking-list');list.textContent='';
  const courseSelect=document.querySelector('#tracking-course');courseSelect.textContent='';const all=document.createElement('option');all.value='';all.textContent='Todos los cursos';courseSelect.appendChild(all);courses.forEach(course=>{const option=document.createElement('option');option.value=course.id;option.textContent=course.title;courseSelect.appendChild(option);});courseSelect.value=selectedCourse;
  const enrollmentSelect=document.querySelector('#enrollment-student');if(enrollmentSelect){enrollmentSelect.textContent='';enrollmentCandidates.forEach(student=>{const option=document.createElement('option');option.value=student.id;option.textContent=student.fullName;enrollmentSelect.appendChild(option);});}
  if(!students.length){list.className='tracking-list empty-state';list.textContent='No hay estudiantes que coincidan con los filtros.';document.querySelector('#student-record').innerHTML='<div class="tracking-empty"><p>No se encontraron expedientes para mostrar.</p></div>';selectedTrackingStudentId=null;return;}
  list.className='tracking-list';
  students.forEach(student=>{const button=document.createElement('button');button.type='button';button.dataset.studentId=student.id;button.className=`tracking-student${Number(student.id)===Number(selectedTrackingStudentId)?' active':''}`;const name=document.createElement('strong');name.textContent=student.fullName;const email=document.createElement('span');email.textContent=student.email;const count=document.createElement('small');count.textContent=`${student.enrolledCourseCount} curso${Number(student.enrolledCourseCount)===1?'':'s'}`;button.append(name,email,count);button.addEventListener('click',()=>loadStudentRecord(student.id));list.appendChild(button);});
  if(selectedTrackingStudentId&&students.some(student=>Number(student.id)===Number(selectedTrackingStudentId)))await loadStudentRecord(selectedTrackingStudentId);
}

async function loadStudentRecord(studentId){
  selectedTrackingStudentId=Number(studentId);document.querySelectorAll('.tracking-student').forEach(button=>button.classList.toggle('active',Number(button.dataset.studentId)===selectedTrackingStudentId));
  const record=document.querySelector('#student-record');record.innerHTML='<div class="tracking-empty"><p>Cargando expediente…</p></div>';
  try{
    const data=await request(`/api/users/students/${studentId}/academic-record`);record.textContent='';
    const profile=document.createElement('div');profile.className='student-profile';const title=document.createElement('h3');title.textContent=data.student.fullName;const email=document.createElement('p');email.textContent=data.student.email;profile.append(title,email);
    const facts=document.createElement('div');facts.className='student-profile-grid';addFact(facts,'Estado',data.student.status==='active'?'Activo':'Inactivo');addFact(facts,'Registrado',displayDate(data.student.createdAt));addFact(facts,'Último acceso',displayDate(data.student.lastLoginAt));
    if(data.application){addFact(facts,'Teléfono',data.application.phone);addFact(facts,'Edad',data.application.ageRange);addFact(facts,'Ubicación',data.application.location);addFact(facts,'Perfil',data.application.pathway==='health-professional'?'Profesional de salud':'Acompañamiento');addFact(facts,'Experiencia en crisis',data.application.crisisExperience?'Sí':'No');addFact(facts,'Procedencia',data.application.referralSource);addFact(facts,'Compromiso de supervisión',data.application.supervisionCommitment?'Aceptado':'No aceptado');addFact(facts,'Postulación',data.application.status);addFact(facts,'Fecha de postulación',displayDate(data.application.createdAt));addFact(facts,'Sesión informativa',data.application.attendedInfoSession===null?'Sin respuesta':data.application.attendedInfoSession?'Asistió':'No asistió');}
    profile.appendChild(facts);
    if(data.application?.motivation){const motivation=document.createElement('div');motivation.className='application-answer';const label=document.createElement('strong');label.textContent='Motivación';const value=document.createElement('p');value.textContent=data.application.motivation;motivation.append(label,value);profile.appendChild(motivation);}
    if(data.application?.sessionFeedback){const feedback=document.createElement('div');feedback.className='application-answer';const label=document.createElement('strong');label.textContent='Comentario sobre la sesión informativa';const value=document.createElement('p');value.textContent=data.application.sessionFeedback;feedback.append(label,value);profile.appendChild(feedback);}
    const heading=document.createElement('h4');heading.className='academic-heading';heading.textContent='Récord académico';profile.appendChild(heading);
    const records=document.createElement('div');records.className='academic-records';if(!data.records.length){records.classList.add('empty-state');records.textContent='El estudiante todavía no tiene cursos dentro de tu alcance.';}data.records.forEach(course=>records.appendChild(buildAcademicCourse(course)));profile.appendChild(records);record.appendChild(profile);
  }catch(error){record.innerHTML='';const empty=document.createElement('div');empty.className='tracking-empty';empty.textContent=error.message;record.appendChild(empty);}
}

function buildAcademicCourse(course){
  const article=document.createElement('article');article.className='academic-course';const header=document.createElement('div');header.className='academic-course-header';const identity=document.createElement('div');const title=document.createElement('h4');title.textContent=course.courseTitle;const teacher=document.createElement('p');teacher.textContent=`Profesor: ${course.teacherName} · Matrícula: ${displayDate(course.enrolledAt)}`;identity.append(title,teacher);const summary=document.createElement('div');summary.className='progress-summary';summary.textContent=`${course.progress}%`;const detail=document.createElement('small');detail.textContent=`${course.completedLessons} de ${course.totalLessons} lecciones`;summary.append(document.createElement('br'),detail);header.append(identity,summary);article.appendChild(header);
  const track=document.createElement('div');track.className='progress-track';track.setAttribute('aria-label',`Progreso ${course.progress}%`);const fill=document.createElement('span');fill.style.width=`${course.progress}%`;track.appendChild(fill);article.appendChild(track);
  const form=document.createElement('form');form.className='support-form';form.dataset.enrollmentId=course.enrollmentId;
  [['Supervisión','supervisionCompleted','Supervisión completada','supervisionNotes',course.supervisionCompleted,course.supervisionNotes],['Práctica','practiceCompleted','Práctica completada','practiceNotes',course.practiceCompleted,course.practiceNotes],['Terapia','therapyAttendance','Asistencia a terapia confirmada','therapyNotes',course.therapyAttendance,course.therapyNotes]].forEach(([legendText,checkName,checkLabel,notesName,checked,notes])=>{const fieldset=document.createElement('fieldset');fieldset.className='support-area';const legend=document.createElement('legend');legend.textContent=legendText;const label=document.createElement('label');label.className='support-check';const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.name=checkName;checkbox.checked=checked;const text=document.createElement('span');text.textContent=checkLabel;label.append(checkbox,text);const textarea=document.createElement('textarea');textarea.name=notesName;textarea.maxLength=5000;textarea.placeholder=`Observaciones de ${legendText.toLowerCase()}`;textarea.value=notes||'';fieldset.append(legend,label,textarea);form.appendChild(fieldset);});
  const actions=document.createElement('div');actions.className='support-actions';const button=document.createElement('button');button.className='small-button';button.type='submit';button.textContent='Guardar acompañamiento';const message=document.createElement('p');message.className='form-message';message.setAttribute('role','alert');actions.append(button,message);form.appendChild(actions);form.addEventListener('submit',saveCourseSupport);article.appendChild(form);return article;
}

async function saveCourseSupport(event){
  event.preventDefault();const form=event.currentTarget;const message=form.querySelector('.form-message');const button=form.querySelector('button[type="submit"]');const values=Object.fromEntries(new FormData(form));values.supervisionCompleted=form.elements.supervisionCompleted.checked;values.practiceCompleted=form.elements.practiceCompleted.checked;values.therapyAttendance=form.elements.therapyAttendance.checked;button.disabled=true;
  try{const data=await request(`/api/users/enrollments/${form.dataset.enrollmentId}/support`,{method:'PATCH',body:JSON.stringify(values)});message.className='form-message success';message.textContent=data.message;}catch(error){message.className='form-message error';message.textContent=error.message;}finally{button.disabled=false;}
}

function buildLessonQuestions(){
  const container=document.querySelector('#lesson-questions-builder');if(!container||container.children.length)return;
  const heading=document.createElement('div');heading.className='questions-heading';heading.innerHTML='<span>Comprobación formativa</span><h4>Seis preguntas de comprensión</h4><p>No asignan puntuación. El estudiante deberá responderlas correctamente para completar la lección.</p>';container.appendChild(heading);
  for(let question=1;question<=6;question+=1){
    const fieldset=document.createElement('fieldset');fieldset.className='question-editor';
    const legend=document.createElement('legend');legend.textContent=`Pregunta ${question}`;fieldset.appendChild(legend);
    const prompt=document.createElement('label');prompt.className='field';prompt.innerHTML=`Enunciado<input name="question${question}Text" maxlength="1000" required>`;fieldset.appendChild(prompt);
    const options=document.createElement('div');options.className='question-options-editor';
    for(let option=1;option<=4;option+=1){const label=document.createElement('label');label.className='field';label.innerHTML=`Opción ${option}<input name="question${question}Option${option}" maxlength="500" required>`;options.appendChild(label);}
    fieldset.appendChild(options);
    const correct=document.createElement('label');correct.className='field correct-option-field';correct.innerHTML=`Opción correcta<select name="question${question}Correct" required><option value="">Selecciona</option><option value="1">Opción 1</option><option value="2">Opción 2</option><option value="3">Opción 3</option><option value="4">Opción 4</option></select>`;fieldset.appendChild(correct);container.appendChild(fieldset);
  }
}
function lessonPayload(values){const questions=[];for(let question=1;question<=6;question+=1)questions.push({text:values[`question${question}Text`],options:[1,2,3,4].map(option=>values[`question${question}Option${option}`]),correctOption:Number(values[`question${question}Correct`])});return{title:values.title,content:values.content,position:Number(values.position),estimatedMinutes:values.estimatedMinutes?Number(values.estimatedMinutes):null,videoUrl:values.videoUrl,pdfUrl:values.pdfUrl,slidesUrl:values.slidesUrl||null,questions};}

function bindCourseBuilder(){
  document.querySelector('#course-builder').hidden=false;
  const bindings=[
    ['#module-form',values=>`/api/learning/courses/${values.courseId}/modules`,values=>({title:values.title,position:Number(values.position)})],
    ['#lesson-form',values=>`/api/learning/modules/${values.moduleId}/lessons`,lessonPayload],
    ['#enrollment-form',values=>`/api/learning/courses/${values.courseId}/enrollments`,values=>({studentId:Number(values.studentId)})]
  ];
  bindings.forEach(([selector,urlFor,payloadFor])=>{const form=document.querySelector(selector);form.addEventListener('submit',async event=>{event.preventDefault();const values=Object.fromEntries(new FormData(form));const message=form.querySelector('.form-message');try{const data=await request(urlFor(values),{method:'POST',body:JSON.stringify(payloadFor(values))});message.className='form-message success';message.textContent=data.message;if(selector==='#enrollment-form')await loadTracking();}catch(error){message.className='form-message error';message.textContent=error.message;}});});
}
function setupUserCreation(){
  const form=document.querySelector('#user-form');const select=form.elements.role;
  const roles=currentUser.role==='superuser'?['administrator','writer','teacher','student']:['writer','teacher','student'];
  roles.forEach(role=>{const option=document.createElement('option');option.value=role;option.textContent=roleNames[role];select.appendChild(option);});
  form.addEventListener('submit',async(event)=>{event.preventDefault();const message=form.querySelector('.form-message');const button=form.querySelector('button');button.disabled=true;try{const data=await request('/api/users',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(form)))});message.className='form-message success';message.textContent=data.message;form.reset();await loadUsers();if(trackingRoles.includes(currentUser.role))await loadTracking();}catch(error){message.className='form-message error';message.textContent=error.message;}finally{button.disabled=false;}});
}

async function init(){
  try{
    csrfToken=(await request('/api/csrf-token')).csrfToken;currentUser=(await request('/api/auth/me')).user;
    document.querySelector('#user-name').textContent=currentUser.fullName.split(' ')[0];document.querySelector('#session-email').textContent=currentUser.email;document.querySelector('#role-label').textContent=roleNames[currentUser.role];
    const descriptions={superuser:'Tienes control global de usuarios, artículos y cursos.',administrator:'Puedes gestionar usuarios, escribir artículos y crear cursos.',writer:'Puedes escribir y publicar artículos educativos.',teacher:'Puedes escribir artículos, crear cursos y acompañar estudiantes.',student:'Tu espacio reúne la formación y los artículos publicados.'};
    document.querySelector('#role-description').textContent=descriptions[currentUser.role];
    if(articleRoles.includes(currentUser.role))document.querySelector('#article-form').hidden=false;
    if(courseRoles.includes(currentUser.role))document.querySelector('#course-form').hidden=false;
    else document.querySelector('#courses-nav').hidden=true;
    if(trackingRoles.includes(currentUser.role)){document.querySelector('#tracking-nav').hidden=false;await loadTracking();}
    if(['superuser','administrator'].includes(currentUser.role)){document.querySelector('#users-nav').hidden=false;document.querySelector('#applications-nav').hidden=false;setupUserCreation();if(currentUser.role==='superuser')setupPasswordReset();await Promise.all([loadUsers(),loadApplications(true),loadDashboardStatistics()]);}
    if(currentUser.role==='superuser'){document.querySelector('#audit-nav').hidden=false;await loadAudit(true);}
    await loadContent();
    if(courseRoles.includes(currentUser.role)){buildLessonQuestions();bindCourseBuilder();}
    openHashPanel();
  }catch(error){if(!currentUser)window.location.replace('/login.html');}
}
bindEditor('#article-form','/api/content/articles');
bindEditor('#course-form','/api/content/courses');
document.querySelector('#logout').addEventListener('click',async()=>{try{await request('/api/auth/logout',{method:'POST'});}finally{window.location.replace('/login.html');}});
document.querySelector('#audit-more').addEventListener('click',()=>loadAudit());
document.querySelector('#audit-filters').addEventListener('submit',event=>{event.preventDefault();loadAudit(true);});
document.querySelector('#audit-clear').addEventListener('click',()=>{document.querySelector('#audit-filters').reset();loadAudit(true);});
document.querySelector('#application-filters').addEventListener('submit',event=>{event.preventDefault();loadApplications(true);});
document.querySelector('#applications-clear').addEventListener('click',()=>{const form=document.querySelector('#application-filters');form.reset();form.elements.status.value='pending';loadApplications(true);});
document.querySelector('#applications-more').addEventListener('click',()=>loadApplications());
document.querySelector('#tracking-filters').addEventListener('submit',event=>{event.preventDefault();loadTracking();});
setupNavigation();
init();
