const roleNames={superuser:'Superusuario',administrator:'Administrador',writer:'Escritor',teacher:'Profesor',student:'Estudiante'};
const articleRoles=['superuser','administrator','writer','teacher'];
const courseRoles=['superuser','administrator','teacher'];
const trackingRoles=['superuser','administrator','teacher'];
let currentUser=null;let csrfToken='';
let editingArticleId=null;
let editingCourseId=null;
let editingModuleId=null;let editingLessonId=null;let managedCourseId=null;
let auditCursor=null;
let profileReviewsCursor=null;

const activityNames={
  login_succeeded:'Inicio de sesión',login_failed:'Intento de acceso fallido',logout:'Cierre de sesión',user_created:'Usuario creado',
  user_role_changed:'Rol de usuario actualizado',user_status_changed:'Estado de usuario actualizado',
  user_password_reset_by_superuser:'Contraseña restablecida por superusuario',
  article_created:'Artículo creado',course_created:'Curso creado',course_updated:'Curso actualizado',
  course_module_created:'Módulo creado',course_module_updated:'Módulo actualizado',lesson_created:'Lección creada',lesson_updated:'Lección actualizada',
  student_enrolled:'Estudiante inscrito',student_tracking_updated:'Seguimiento actualizado',
  enrollment_support_updated:'Acompañamiento de matrícula actualizado',
  lesson_progress_updated:'Progreso de lección actualizado',password_changed:'Contraseña actualizada',
  password_reset_requested:'Recuperación solicitada',password_reset_delivery_unconfigured:'Recuperación sin proveedor de correo',
  password_reset_delivery_failed:'Fallo al entregar recuperación',password_reset_completed:'Contraseña restablecida',
  mfa_verified:'Verificación MFA completada',
  mfa_challenge_limited:'Desafío MFA limitado temporalmente',
  application_submitted:'Solicitud histórica recibida',application_reviewed:'Solicitud histórica revisada',
  application_duplicate_ignored:'Solicitud histórica repetida ignorada',
  student_account_created_from_application:'Cuenta estudiantil creada desde solicitud histórica',
  public_registration_created:'Cuenta pública creada',public_registration_duplicate_ignored:'Registro duplicado ignorado',
  email_verification_renewed:'Verificación de correo renovada',email_verification_sent:'Verificación de correo enviada',
  email_verification_delivery_failed:'Fallo al entregar verificación',email_verified:'Correo verificado'
  ,student_profile_saved:'Perfil estudiantil guardado',student_profile_submitted:'Perfil estudiantil enviado',student_profile_reviewed:'Perfil estudiantil revisado'
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
  items.forEach(item=>{const card=document.createElement('article');card.className='content-card';const eyebrow=document.createElement('span');const created=type==='article'&&item.createdAt?` · ${new Intl.DateTimeFormat('es',{dateStyle:'medium'}).format(new Date(item.createdAt))}`:'';eyebrow.textContent=`${item.status==='published'?'Publicado':'Borrador'} · ${type==='article'?item.author:item.creator}${created}`;const title=document.createElement('h3');title.textContent=item.title;const copy=document.createElement('p');copy.textContent=type==='article'?item.summary:item.description;card.append(eyebrow,title,copy);if(type==='article'){const link=document.createElement('a');link.className='content-link';link.href=`/articulo.html?slug=${encodeURIComponent(item.slug)}`;link.textContent='Leer artículo →';card.appendChild(link);if(item.pdfUrl){const pdf=document.createElement('a');pdf.className='content-link';pdf.href=item.pdfUrl;pdf.target='_blank';pdf.rel='noopener noreferrer';pdf.textContent='Descargar PDF ↗';card.appendChild(pdf);}if(['superuser','administrator'].includes(currentUser.role)||Number(item.authorId)===Number(currentUser.id)){const edit=document.createElement('button');edit.type='button';edit.className='small-button';edit.textContent='Editar artículo';edit.addEventListener('click',()=>startArticleEdit(item));card.appendChild(edit);}}else if(['superuser','administrator'].includes(currentUser.role)||item.creatorId===currentUser.id){const edit=document.createElement('button');edit.type='button';edit.className='small-button';edit.textContent='Editar curso';edit.addEventListener('click',()=>startCourseEdit(item));const content=document.createElement('button');content.type='button';content.className='small-button';content.textContent='Editar contenido';content.addEventListener('click',()=>loadCourseContentEditor(item));card.append(edit,content);}container.appendChild(card);});
}
function renderRoleSummary(articles,courses){const grid=document.querySelector('#role-summary-grid');if(currentUser.role!=='teacher'){grid.hidden=true;return;}const ownCourses=courses.filter(course=>Number(course.creatorId)===Number(currentUser.id));const ownArticles=articles.filter(article=>Number(article.authorId)===Number(currentUser.id));grid.textContent='';[['Cursos a tu cargo',ownCourses.length,'Formación'],['Cursos publicados',ownCourses.filter(course=>course.status==='published').length,'Catálogo'],['Artículos creados',ownArticles.length,'Blog']].forEach(([label,value,eyebrow])=>{const card=document.createElement('article');card.className='dashboard-summary-card';const tag=document.createElement('span');tag.textContent=eyebrow;const count=document.createElement('strong');count.textContent=value;const text=document.createElement('p');text.textContent=label;card.append(tag,count,text);grid.appendChild(card);});grid.hidden=false;}
async function loadContent(){const [{articles},{courses}]=await Promise.all([request('/api/content/articles'),request('/api/content/courses')]);renderItems('#articles-list',articles,'article');renderItems('#courses-list',courses,'course');renderRoleSummary(articles,courses);document.querySelectorAll('.course-selector').forEach(select=>{select.textContent='';courses.filter(course=>['superuser','administrator'].includes(currentUser.role)||course.creatorId===currentUser.id).forEach(course=>{const option=document.createElement('option');option.value=course.id;option.textContent=course.title;select.appendChild(option);});});}

async function loadDashboardStatistics(){
  const section=document.querySelector('#dashboard-statistics');const grid=document.querySelector('#statistics-grid');const coursesList=document.querySelector('#course-statistics-list');const message=document.querySelector('#statistics-message');section.hidden=false;grid.textContent='';coursesList.textContent='';message.textContent='';
  try{
    const {totals,courses}=await request('/api/dashboard/statistics');
    [['Estudiantes inscritos',totals.enrolledStudents],['Cursos creados',totals.coursesCreated],['Artículos creados',totals.articlesCreated],['Profesores',totals.teachers],['Escritores',totals.writers]].forEach(([label,value])=>{const card=document.createElement('article');card.className='statistic-card';const name=document.createElement('span');name.textContent=label;const count=document.createElement('strong');count.textContent=Number(value)||0;card.append(name,count);grid.appendChild(card);});
    if(!courses.length){const empty=document.createElement('p');empty.className='empty-state';empty.textContent='Todavía no hay cursos creados.';coursesList.appendChild(empty);}
    courses.forEach(course=>{const row=document.createElement('div');row.className='course-statistic-row';const identity=document.createElement('div');const title=document.createElement('strong');title.textContent=course.title;const status=document.createElement('small');status.textContent=course.status==='published'?'Publicado':'Borrador';identity.append(title,status);const count=document.createElement('span');count.textContent=Number(course.enrolledStudents)||0;count.setAttribute('aria-label',`${count.textContent} estudiantes inscritos`);row.append(identity,count);coursesList.appendChild(row);});
  }catch(error){message.className='form-message error';message.textContent=error.message;}
}

function bindEditor(formId,url){
  const form=document.querySelector(formId);
  form.addEventListener('submit',async(event)=>{event.preventDefault();const message=form.querySelector('.form-message');const button=form.querySelector('button[type="submit"]');const values=Object.fromEntries(new FormData(form));values.status=values.publish?'published':'draft';delete values.publish;button.disabled=true;message.className='form-message';try{const data=await request(url,{method:'POST',body:JSON.stringify(values)});message.classList.add('success');message.textContent=data.message;form.reset();await loadContent();}catch(error){message.classList.add('error');message.textContent=error.message;}finally{button.disabled=false;}});
}

function resetCourseEditor(){
  const form=document.querySelector('#course-form');editingCourseId=null;form.reset();form.elements.enrollmentPolicy.value='admin_only';document.querySelector('#course-form-title').textContent='Nuevo curso';document.querySelector('#course-edit-cancel').hidden=true;form.querySelector('button[type="submit"]').textContent='Guardar curso';
}

function resetArticleEditor(){const form=document.querySelector('#article-form');editingArticleId=null;form.reset();document.querySelector('#article-form-title').textContent='Nuevo artículo';document.querySelector('#article-edit-cancel').hidden=true;form.querySelector('button[type="submit"]').textContent='Guardar artículo';}
async function startArticleEdit(article){const {article:detail}=await request(`/api/content/articles/${encodeURIComponent(article.slug)}`);const form=document.querySelector('#article-form');editingArticleId=detail.id;form.elements.title.value=detail.title;form.elements.summary.value=detail.summary;form.elements.body.value=detail.body;form.elements.pdfUrl.value=detail.pdfUrl||'';form.elements.publish.checked=detail.status==='published';document.querySelector('#article-form-title').textContent='Editar artículo';document.querySelector('#article-edit-cancel').hidden=false;form.querySelector('button[type="submit"]').textContent='Actualizar artículo';form.scrollIntoView({behavior:'smooth',block:'start'});}
function setupArticleEditor(){const form=document.querySelector('#article-form');document.querySelector('#article-edit-cancel').addEventListener('click',resetArticleEditor);form.addEventListener('submit',async event=>{event.preventDefault();const message=form.querySelector('.form-message');const button=form.querySelector('button[type="submit"]');const values=Object.fromEntries(new FormData(form));values.status=values.publish?'published':'draft';delete values.publish;button.disabled=true;message.className='form-message';try{const data=await request(editingArticleId?`/api/content/articles/${editingArticleId}`:'/api/content/articles',{method:editingArticleId?'PATCH':'POST',body:JSON.stringify(values)});resetArticleEditor();message.className='form-message success';message.textContent=data.message;await loadContent();}catch(error){message.className='form-message error';message.textContent=error.message;}finally{button.disabled=false;}});}
function startCourseEdit(course){
  const form=document.querySelector('#course-form');const price=course.prices?.[0];editingCourseId=course.id;form.elements.title.value=course.title;form.elements.description.value=course.description;form.elements.accessType.value=course.accessType||'free';form.elements.enrollmentPolicy.value=course.enrollmentPolicy||'admin_only';form.elements.priceCurrency.value=price?.currency||'';form.elements.priceAmount.value=price?(Number(price.amountMinor)/100).toFixed(2):'';form.elements.publish.checked=course.status==='published';document.querySelector('#course-form-title').textContent='Editar curso';document.querySelector('#course-edit-cancel').hidden=false;form.querySelector('button[type="submit"]').textContent='Actualizar curso';form.scrollIntoView({behavior:'smooth',block:'start'});
}
function setupCourseEditor(){
  const form=document.querySelector('#course-form');document.querySelector('#course-edit-cancel').addEventListener('click',resetCourseEditor);
  form.addEventListener('submit',async event=>{event.preventDefault();const message=form.querySelector('.form-message');const button=form.querySelector('button[type="submit"]');const values=Object.fromEntries(new FormData(form));const priceCurrency=String(values.priceCurrency||'').trim().toUpperCase();const priceText=String(values.priceAmount||'').trim();values.status=values.publish?'published':'draft';delete values.publish;delete values.priceCurrency;delete values.priceAmount;button.disabled=true;message.className='form-message';try{if(values.accessType==='paid'&&(!/^[A-Z]{3}$/.test(priceCurrency)||!/^\d+(\.\d{1,2})?$/.test(priceText)))throw new Error('Indica moneda e importe válidos para el curso pago.');const data=await request(editingCourseId?`/api/content/courses/${editingCourseId}`:'/api/content/courses',{method:editingCourseId?'PATCH':'POST',body:JSON.stringify(values)});const courseId=editingCourseId||data.id;if(values.accessType==='paid'&&priceText)await request(`/api/commerce/courses/${courseId}/prices`,{method:'POST',body:JSON.stringify({currency:priceCurrency,amountMinor:Math.round(Number(priceText)*100)})});resetCourseEditor();message.className='form-message success';message.textContent=data.message;await loadContent();}catch(error){message.className='form-message error';message.textContent=error.message;}finally{button.disabled=false;}});
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

const profileReviewStates={submitted:'Pendiente',under_review:'En revisión',changes_requested:'Requiere correcciones',approved:'Aprobado',rejected:'Rechazado'};
const profileDecisions={submitted:[['start_review','Iniciar revisión']],under_review:[['request_changes','Solicitar cambios'],['approve','Aprobar'],['reject','Rechazar']],approved:[['reopen','Reabrir revisión']],rejected:[['reopen','Reabrir revisión']],changes_requested:[]};
async function loadProfileReviews(reset=false){const list=document.querySelector('#profile-reviews-list');const message=document.querySelector('#profile-reviews-message');const more=document.querySelector('#profile-reviews-more');if(reset){profileReviewsCursor=null;list.textContent='';}more.disabled=true;message.className='form-message';message.textContent='';try{const query=new URLSearchParams({limit:'30'});new FormData(document.querySelector('#profile-review-filters')).forEach((value,key)=>{if(String(value).trim())query.set(key,String(value).trim());});if(profileReviewsCursor)query.set('cursor',profileReviewsCursor);const{profiles,nextCursor}=await request(`/api/student-profile-reviews?${query}`);if(!profiles.length&&!list.children.length)message.textContent='No hay perfiles con estos filtros.';profiles.forEach(profile=>list.appendChild(profileReviewCard(profile)));profileReviewsCursor=nextCursor;more.hidden=!nextCursor;}catch(error){message.className='form-message error';message.textContent=error.message;}finally{more.disabled=false;}}
function addProfileFact(container,label,value){if(value===null||value===undefined||value==='')return;const row=document.createElement('p');const strong=document.createElement('strong');strong.textContent=`${label}: `;row.append(strong,document.createTextNode(String(value)));container.appendChild(row);}
function profileReviewCard(profile){const form=document.createElement('form');form.className='application-review';form.dataset.profileId=profile.id;const person=document.createElement('div');person.className='application-person';const date=document.createElement('span');date.textContent=profile.submittedAt?new Intl.DateTimeFormat('es',{dateStyle:'medium'}).format(new Date(profile.submittedAt)):'Sin fecha de envío';const title=document.createElement('h3');title.textContent=profile.fullName;const contact=document.createElement('p');contact.className='application-contact';contact.textContent=`${profile.email} · ${profile.phone||'Sin teléfono'} · ${profile.city||''}, ${profile.country||''}`;const badges=document.createElement('div');badges.className='application-badges';const badge=document.createElement('span');badge.textContent=profileReviewStates[profile.reviewStatus]||profile.reviewStatus;badges.appendChild(badge);person.append(date,title,contact,badges);const facts=document.createElement('div');facts.className='application-answer';addProfileFact(facts,'Documento',`${profile.documentType||''} ${profile.documentNumber||''}`.trim());addProfileFact(facts,'Profesión',profile.profession);addProfileFact(facts,'Formación',profile.educationLevel);addProfileFact(facts,'Institución',profile.institution);addProfileFact(facts,'Licencia',profile.licenseNumber);addProfileFact(facts,'Experiencia',profile.yearsExperience===null?'':`${profile.yearsExperience} años`);addProfileFact(facts,'Camino',profile.pathway);addProfileFact(facts,'Motivación',profile.motivation);const controls=document.createElement('div');controls.className='form-grid';const decisionField=document.createElement('div');decisionField.className='field';const label=document.createElement('label');label.textContent='Decisión';const select=document.createElement('select');select.name='decision';const choices=profileDecisions[profile.reviewStatus]||[];choices.forEach(([value,text])=>{const option=document.createElement('option');option.value=value;option.textContent=text;select.appendChild(option);});decisionField.append(label,select);const notesField=document.createElement('div');notesField.className='field';const notesLabel=document.createElement('label');notesLabel.textContent='Nota para el estudiante';const notes=document.createElement('textarea');notes.name='notes';notes.maxLength=5000;notes.rows=4;notesField.append(notesLabel,notes);controls.append(decisionField,notesField);const message=document.createElement('p');message.className='form-message';const button=document.createElement('button');button.className='small-button';button.type='submit';button.textContent='Registrar decisión';button.disabled=!choices.length;form.append(person,facts,controls,message,button);form.addEventListener('submit',saveProfileReview);return form;}
async function saveProfileReview(event){event.preventDefault();const form=event.currentTarget;const message=form.querySelector('.form-message');const button=form.querySelector('button[type="submit"]');button.disabled=true;try{const data=await request(`/api/student-profile-reviews/${form.dataset.profileId}/decisions`,{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(form)))});await loadProfileReviews(true);const global=document.querySelector('#profile-reviews-message');global.className='form-message success';global.textContent=data.message;}catch(error){message.className='form-message error';message.textContent=error.message;}finally{button.disabled=false;}}
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
    if(data.application){addFact(facts,'Teléfono',data.application.phone);addFact(facts,'Edad',data.application.ageRange);addFact(facts,'Ubicación',data.application.location);addFact(facts,'Perfil',data.application.pathway==='health-professional'?'Profesional de salud':'Acompañamiento');addFact(facts,'Experiencia en crisis',data.application.crisisExperience?'Sí':'No');addFact(facts,'Procedencia',data.application.referralSource);addFact(facts,'Compromiso de supervisión',data.application.supervisionCommitment?'Aceptado':'No aceptado');addFact(facts,'Solicitud histórica',data.application.status);addFact(facts,'Fecha de solicitud',displayDate(data.application.createdAt));addFact(facts,'Sesión informativa',data.application.attendedInfoSession===null?'Sin respuesta':data.application.attendedInfoSession?'Asistió':'No asistió');}
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
  if(course.modules?.length){course.modules.forEach(module=>article.appendChild(buildModuleCertificationReview(course.enrollmentId,module)));return article;}
  const form=document.createElement('form');form.className='support-form';form.dataset.enrollmentId=course.enrollmentId;
  [['Supervisión','supervisionCompleted','Supervisión completada','supervisionNotes',course.supervisionCompleted,course.supervisionNotes],['Práctica','practiceCompleted','Práctica completada','practiceNotes',course.practiceCompleted,course.practiceNotes],['Trabajo personal','personalWorkCompleted','Trabajo personal completado','personalWorkNotes',course.personalWorkCompleted,course.personalWorkNotes]].forEach(([legendText,checkName,checkLabel,notesName,checked,notes])=>{const fieldset=document.createElement('fieldset');fieldset.className='support-area';const legend=document.createElement('legend');legend.textContent=legendText;const label=document.createElement('label');label.className='support-check';const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.name=checkName;checkbox.checked=checked;const text=document.createElement('span');text.textContent=checkLabel;label.append(checkbox,text);const textarea=document.createElement('textarea');textarea.name=notesName;textarea.maxLength=5000;textarea.placeholder=`Observaciones de ${legendText.toLowerCase()}`;textarea.value=notes||'';fieldset.append(legend,label,textarea);form.appendChild(fieldset);});
  const actions=document.createElement('div');actions.className='support-actions';const button=document.createElement('button');button.className='small-button';button.type='submit';button.textContent='Guardar acompañamiento';const message=document.createElement('p');message.className='form-message';message.setAttribute('role','alert');actions.append(button,message);form.appendChild(actions);form.addEventListener('submit',saveCourseSupport);article.appendChild(form);return article;
}

async function saveCourseSupport(event){
  event.preventDefault();const form=event.currentTarget;const message=form.querySelector('.form-message');const button=form.querySelector('button[type="submit"]');const values=Object.fromEntries(new FormData(form));values.supervisionCompleted=form.elements.supervisionCompleted.checked;values.practiceCompleted=form.elements.practiceCompleted.checked;values.personalWorkCompleted=form.elements.personalWorkCompleted.checked;button.disabled=true;
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

function resetModuleEditor(){
  const form=document.querySelector('#module-form');editingModuleId=null;form.reset();document.querySelector('#module-form-title').textContent='Añadir módulo';document.querySelector('#module-edit-cancel').hidden=true;form.querySelector('button[type="submit"]').textContent='Crear módulo';if(managedCourseId)form.elements.courseId.value=managedCourseId;
}
function resetLessonEditor(){
  const form=document.querySelector('#lesson-form');editingLessonId=null;form.reset();document.querySelector('#lesson-form-title').textContent='Añadir lección';document.querySelector('#lesson-edit-cancel').hidden=true;form.querySelector('button[type="submit"]').textContent='Crear lección';
}

const certificationAreaLabels={supervision:'Supervisión',practice:'Práctica',personal_work:'Trabajo personal'};
function buildModuleCertificationReview(enrollmentId,module){
  const form=document.createElement('form');form.className='support-form module-certification-review';form.dataset.enrollmentId=enrollmentId;form.dataset.moduleId=module.id;const heading=document.createElement('h5');heading.textContent=`Módulo ${module.position}: ${module.title} · ${module.approved?'Aprobado':'Pendiente'}`;form.appendChild(heading);
  module.areas.forEach(area=>{const fieldset=document.createElement('fieldset');fieldset.className='support-area';const legend=document.createElement('legend');legend.textContent=certificationAreaLabels[area.area];const question=document.createElement('p');question.className='certification-question';question.textContent=area.question;const answerLabel=document.createElement('strong');answerLabel.textContent='Respuesta del alumno';const answer=document.createElement('p');answer.className='certification-answer';answer.textContent=area.answer||'Pendiente de respuesta.';const check=document.createElement('label');check.className='support-check';const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.name=`${area.area}Certified`;checkbox.checked=area.certified;checkbox.disabled=!area.answer;check.append(checkbox,document.createTextNode(' Certificar cumplimiento'));const observation=document.createElement('textarea');observation.name=`${area.area}Observation`;observation.maxLength=5000;observation.placeholder='Observaciones visibles para el alumno';observation.value=area.observation||'';fieldset.append(legend,question,answerLabel,answer,check,observation);form.appendChild(fieldset);});
  const actions=document.createElement('div');actions.className='support-actions';const button=document.createElement('button');button.type='submit';button.className='small-button';button.textContent='Guardar revisión del módulo';const message=document.createElement('p');message.className='form-message';actions.append(button,message);form.appendChild(actions);form.addEventListener('submit',saveModuleCertificationReview);return form;
}
async function saveModuleCertificationReview(event){
  event.preventDefault();const form=event.currentTarget;const button=form.querySelector('button[type="submit"]');const message=form.querySelector('.form-message');const areas={};Object.keys(certificationAreaLabels).forEach(area=>{areas[area]={certified:form.elements[`${area}Certified`].checked,observation:form.elements[`${area}Observation`].value};});button.disabled=true;try{const data=await request(`/api/module-certification/enrollments/${form.dataset.enrollmentId}/modules/${form.dataset.moduleId}/review`,{method:'PATCH',body:JSON.stringify({areas})});message.className='form-message success';message.textContent=data.message;await loadStudentRecord(selectedTrackingStudentId);}catch(error){message.className='form-message error';message.textContent=error.message;}finally{button.disabled=false;}
}
function startLessonCreation(module){
  resetLessonEditor();const form=document.querySelector('#lesson-form');form.elements.moduleId.value=module.id;document.querySelector('#lesson-form-title').textContent=`Añadir lección · ${module.title}`;form.scrollIntoView({behavior:'smooth',block:'start'});form.elements.position.focus();
}
function startModuleEdit(module){
  const form=document.querySelector('#module-form');editingModuleId=module.id;form.elements.courseId.value=managedCourseId;form.elements.title.value=module.title;form.elements.position.value=module.position;const byArea=Object.fromEntries((module.certification||[]).map(item=>[item.area,item.question]));form.elements.certificationSupervision.value=byArea.supervision||'';form.elements.certificationPractice.value=byArea.practice||'';form.elements.certificationPersonalWork.value=byArea.personal_work||'';document.querySelector('#module-form-title').textContent='Editar módulo';document.querySelector('#module-edit-cancel').hidden=false;form.querySelector('button[type="submit"]').textContent='Actualizar módulo';form.scrollIntoView({behavior:'smooth',block:'start'});
}
function startLessonEdit(lesson){
  const form=document.querySelector('#lesson-form');editingLessonId=lesson.id;form.elements.moduleId.value=lesson.moduleId;form.elements.title.value=lesson.title;form.elements.content.value=lesson.content;form.elements.position.value=lesson.position;form.elements.estimatedMinutes.value=lesson.estimatedMinutes||'';form.elements.videoUrl.value=lesson.videoUrl;form.elements.pdfUrl.value=lesson.pdfUrl;form.elements.slidesUrl.value=lesson.slidesUrl||'';
  for(let index=0;index<6;index+=1){const question=lesson.questions[index];form.elements[`question${index+1}Text`].value=question?.text||'';for(let option=0;option<4;option+=1)form.elements[`question${index+1}Option${option+1}`].value=question?.options[option]?.text||'';form.elements[`question${index+1}Correct`].value=question?.correctOption||'';}
  document.querySelector('#lesson-form-title').textContent='Editar lección';document.querySelector('#lesson-edit-cancel').hidden=false;form.querySelector('button[type="submit"]').textContent='Actualizar lección';form.scrollIntoView({behavior:'smooth',block:'start'});
}
function renderCourseContentEditor(course,modules){
  const manager=document.querySelector('#course-content-manager');const container=document.querySelector('#managed-course-structure');manager.hidden=false;document.querySelector('#managed-course-title').textContent=course.title;container.textContent='';
  if(!modules.length){const empty=document.createElement('p');empty.className='empty-state';empty.textContent='Este curso todavía no tiene módulos.';container.appendChild(empty);return;}
  modules.forEach(module=>{const article=document.createElement('article');article.className='managed-module';const header=document.createElement('div');header.className='managed-module-header';const title=document.createElement('h4');title.textContent=`${module.position}. ${module.title} · ID ${module.id}`;const actions=document.createElement('div');actions.className='managed-module-actions';const addLesson=document.createElement('button');addLesson.type='button';addLesson.className='small-button';addLesson.textContent='Añadir lección';addLesson.addEventListener('click',()=>startLessonCreation(module));const edit=document.createElement('button');edit.type='button';edit.className='small-button';edit.textContent='Editar módulo';edit.addEventListener('click',()=>startModuleEdit(module));actions.append(addLesson,edit);header.append(title,actions);article.appendChild(header);const lessons=document.createElement('div');lessons.className='managed-lessons';module.lessons.forEach(lesson=>{const row=document.createElement('div');row.className='managed-lesson';const identity=document.createElement('div');const name=document.createElement('strong');name.textContent=`${lesson.position}. ${lesson.title}`;const detail=document.createElement('span');detail.textContent=lesson.estimatedMinutes?`${lesson.estimatedMinutes} minutos`:'Duración no indicada';identity.append(name,detail);const lessonEdit=document.createElement('button');lessonEdit.type='button';lessonEdit.className='small-button';lessonEdit.textContent='Editar lección';lessonEdit.addEventListener('click',()=>startLessonEdit(lesson));row.append(identity,lessonEdit);lessons.appendChild(row);});if(!module.lessons.length){const empty=document.createElement('p');empty.className='empty-state';empty.textContent='Sin lecciones.';lessons.appendChild(empty);}article.appendChild(lessons);container.appendChild(article);});
}
async function loadCourseContentEditor(course){
  managedCourseId=Number(course.id);document.querySelectorAll('.course-selector').forEach(select=>{select.value=String(managedCourseId);});const data=await request(`/api/learning/courses/${managedCourseId}/structure`);renderCourseContentEditor(data.course,data.modules);document.querySelector('#course-content-manager').scrollIntoView({behavior:'smooth',block:'start'});
}
function bindCourseBuilder(){
  document.querySelector('#course-builder').hidden=false;
  document.querySelector('#module-edit-cancel').addEventListener('click',resetModuleEditor);document.querySelector('#lesson-edit-cancel').addEventListener('click',resetLessonEditor);
  const moduleForm=document.querySelector('#module-form');moduleForm.addEventListener('submit',async event=>{event.preventDefault();const values=Object.fromEntries(new FormData(moduleForm));const message=moduleForm.querySelector('.form-message');const url=editingModuleId?`/api/learning/modules/${editingModuleId}`:`/api/learning/courses/${values.courseId}/modules`;try{const moduleId=editingModuleId;const questionValues=[values.certificationSupervision,values.certificationPractice,values.certificationPersonalWork].map(value=>String(value||'').trim());if(questionValues.some(Boolean)&&!questionValues.every(value=>value.length>=5))throw new Error('Completa las tres preguntas de certificación (mínimo 5 caracteres).');const data=await request(url,{method:editingModuleId?'PATCH':'POST',body:JSON.stringify({title:values.title,position:Number(values.position)})});if(questionValues.every(value=>value.length>=5))await request(`/api/module-certification/modules/${moduleId||data.id}/questions`,{method:'PUT',body:JSON.stringify({questions:{supervision:questionValues[0],practice:questionValues[1],personal_work:questionValues[2]}})});resetModuleEditor();message.className='form-message success';message.textContent=questionValues.every(Boolean)?'Módulo y preguntas guardados.':data.message;if(managedCourseId)await loadCourseContentEditor({id:managedCourseId});}catch(error){message.className='form-message error';message.textContent=error.message;}});
  const lessonForm=document.querySelector('#lesson-form');lessonForm.addEventListener('submit',async event=>{event.preventDefault();const values=Object.fromEntries(new FormData(lessonForm));const message=lessonForm.querySelector('.form-message');const url=editingLessonId?`/api/learning/lessons/${editingLessonId}`:`/api/learning/modules/${values.moduleId}/lessons`;try{const data=await request(url,{method:editingLessonId?'PATCH':'POST',body:JSON.stringify(lessonPayload(values))});resetLessonEditor();message.className='form-message success';message.textContent=data.message;if(managedCourseId)await loadCourseContentEditor({id:managedCourseId});}catch(error){message.className='form-message error';message.textContent=error.message;}});
  const enrollmentForm=document.querySelector('#enrollment-form');enrollmentForm.addEventListener('submit',async event=>{event.preventDefault();const values=Object.fromEntries(new FormData(enrollmentForm));const message=enrollmentForm.querySelector('.form-message');try{const data=await request(`/api/learning/courses/${values.courseId}/enrollments`,{method:'POST',body:JSON.stringify({studentId:Number(values.studentId)})});message.className='form-message success';message.textContent=data.message;await loadTracking();}catch(error){message.className='form-message error';message.textContent=error.message;}});
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
    const firstName=currentUser.fullName.split(' ')[0];document.querySelector('#user-name').textContent=firstName;document.querySelector('#session-email').textContent=currentUser.email;document.querySelector('#role-label').textContent=roleNames[currentUser.role];document.querySelector('#sidebar-name').textContent=currentUser.fullName;document.querySelector('#sidebar-role').textContent=roleNames[currentUser.role];document.querySelector('#sidebar-avatar').textContent=firstName.charAt(0).toUpperCase();
    const descriptions={superuser:'Tienes control global de usuarios, artículos y cursos.',administrator:'Puedes gestionar usuarios, escribir artículos y crear cursos.',writer:'Puedes escribir y publicar artículos educativos.',teacher:'Puedes escribir artículos, crear cursos y acompañar estudiantes.',student:'Tu espacio reúne la formación y los artículos publicados.'};
    document.querySelector('#role-description').textContent=descriptions[currentUser.role];
    if(articleRoles.includes(currentUser.role))document.querySelector('#article-form').hidden=false;
    if(courseRoles.includes(currentUser.role))document.querySelector('#course-form').hidden=false;
    else document.querySelector('#courses-nav').hidden=true;
    if(trackingRoles.includes(currentUser.role)){document.querySelector('#tracking-nav').hidden=false;await loadTracking();}
    if(['superuser','administrator'].includes(currentUser.role)){document.querySelector('#users-nav').hidden=false;document.querySelector('#profile-reviews-nav').hidden=false;setupUserCreation();if(currentUser.role==='superuser')setupPasswordReset();await Promise.all([loadUsers(),loadProfileReviews(true),loadDashboardStatistics()]);}
    if(currentUser.role==='superuser'){document.querySelector('#audit-nav').hidden=false;await loadAudit(true);}
    await loadContent();
    if(courseRoles.includes(currentUser.role)){buildLessonQuestions();bindCourseBuilder();}
    openHashPanel();
  }catch(error){if(!currentUser)window.location.replace('/login.html');}
}
setupArticleEditor();
setupCourseEditor();
document.querySelector('#logout').addEventListener('click',async()=>{try{await request('/api/auth/logout',{method:'POST'});}finally{window.location.replace('/login.html');}});
document.querySelector('#audit-more').addEventListener('click',()=>loadAudit());
document.querySelector('#audit-filters').addEventListener('submit',event=>{event.preventDefault();loadAudit(true);});
document.querySelector('#audit-clear').addEventListener('click',()=>{document.querySelector('#audit-filters').reset();loadAudit(true);});
document.querySelector('#profile-review-filters').addEventListener('submit',event=>{event.preventDefault();loadProfileReviews(true);});
document.querySelector('#profile-reviews-clear').addEventListener('click',()=>{const form=document.querySelector('#profile-review-filters');form.reset();form.elements.status.value='submitted';loadProfileReviews(true);});
document.querySelector('#profile-reviews-more').addEventListener('click',()=>loadProfileReviews());
document.querySelector('#tracking-filters').addEventListener('submit',event=>{event.preventDefault();loadTracking();});
setupNavigation();
init();
