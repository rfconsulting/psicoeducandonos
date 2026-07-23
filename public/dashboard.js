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
  items.forEach(item=>{const card=document.createElement('article');card.className='content-card';const eyebrow=document.createElement('span');eyebrow.textContent=`${item.status==='published'?'Publicado':'Borrador'} · ${type==='article'?item.author:item.creator}`;const title=document.createElement('h3');title.textContent=item.title;const copy=document.createElement('p');copy.textContent=type==='article'?item.summary:item.description;card.append(eyebrow,title,copy);if(type==='article'){const link=document.createElement('a');link.className='content-link';link.href=`/articulo.html?slug=${encodeURIComponent(item.slug)}`;link.textContent='Leer artículo →';card.appendChild(link);}container.appendChild(card);});
}
async function loadContent(){const [{articles},{courses}]=await Promise.all([request('/api/content/articles'),request('/api/content/courses')]);renderItems('#articles-list',articles,'article');renderItems('#courses-list',courses,'course');document.querySelectorAll('.course-selector').forEach(select=>{select.textContent='';courses.filter(course=>['superuser','administrator'].includes(currentUser.role)||course.creatorId===currentUser.id).forEach(course=>{const option=document.createElement('option');option.value=course.id;option.textContent=course.title;select.appendChild(option);});});}

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
  event.preventDefault();const form=event.currentTarget;const message=form.querySelector('.form-message');const button=form.querySelector('button[type="submit"]');button.disabled=true;
  try{const data=await request(`/api/applications/${form.dataset.applicationId}/review`,{method:'PATCH',body:JSON.stringify(Object.fromEntries(new FormData(form)))});message.className='form-message success';message.textContent=data.message;}catch(error){message.className='form-message error';message.textContent=error.message;}finally{button.disabled=false;}
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

async function loadTracking(){
  const {students}=await request('/api/users/students/tracking');const list=document.querySelector('#tracking-list');list.textContent='';
  const enrollmentSelect=document.querySelector('#enrollment-student');if(enrollmentSelect){enrollmentSelect.textContent='';students.filter(student=>student.status==='active').forEach(student=>{const option=document.createElement('option');option.value=student.id;option.textContent=`${student.fullName} · ${student.email}`;enrollmentSelect.appendChild(option);});}
  if(!students.length){list.textContent='Todavía no hay estudiantes registrados.';return;}
  students.forEach(student=>{const card=document.createElement('form');card.className='tracking-card';card.dataset.studentId=student.id;card.innerHTML=`<div class="tracking-person"><strong></strong><span></span><small>${student.status==='active'?'Activo':'Inactivo'}</small></div><label>Etapa<select name="stage"><option value="not_started">Sin iniciar</option><option value="in_progress">En curso</option><option value="completed">Completado</option><option value="paused">Pausado</option></select></label><label>Progreso<input name="progress" type="number" min="0" max="100" value="${student.progress}"></label><label class="tracking-notes">Observaciones<textarea name="notes" maxlength="5000"></textarea></label><button class="small-button" type="submit">Guardar seguimiento</button>`;
    card.querySelector('.tracking-person strong').textContent=student.fullName;card.querySelector('.tracking-person span').textContent=student.email;card.elements.stage.value=student.stage;card.elements.notes.value=student.notes;
    card.addEventListener('submit',saveTracking);list.appendChild(card);
  });
}

function bindCourseBuilder(){
  document.querySelector('#course-builder').hidden=false;
  const bindings=[
    ['#module-form',values=>`/api/learning/courses/${values.courseId}/modules`,values=>({title:values.title,position:Number(values.position)})],
    ['#lesson-form',values=>`/api/learning/modules/${values.moduleId}/lessons`,values=>({title:values.title,content:values.content,position:Number(values.position),estimatedMinutes:values.estimatedMinutes?Number(values.estimatedMinutes):null})],
    ['#enrollment-form',values=>`/api/learning/courses/${values.courseId}/enrollments`,values=>({studentId:Number(values.studentId)})]
  ];
  bindings.forEach(([selector,urlFor,payloadFor])=>{const form=document.querySelector(selector);form.addEventListener('submit',async event=>{event.preventDefault();const values=Object.fromEntries(new FormData(form));const message=form.querySelector('.form-message');try{const data=await request(urlFor(values),{method:'POST',body:JSON.stringify(payloadFor(values))});message.className='form-message success';message.textContent=data.message;}catch(error){message.className='form-message error';message.textContent=error.message;}});});
}
async function saveTracking(event){event.preventDefault();const form=event.currentTarget;const message=document.querySelector('#tracking-message');const values=Object.fromEntries(new FormData(form));values.progress=Number(values.progress);try{const data=await request(`/api/users/students/${form.dataset.studentId}/tracking`,{method:'PATCH',body:JSON.stringify(values)});message.className='form-message success';message.textContent=data.message;}catch(error){message.className='form-message error';message.textContent=error.message;}}

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
    if(['superuser','administrator'].includes(currentUser.role)){document.querySelector('#users-nav').hidden=false;document.querySelector('#applications-nav').hidden=false;setupUserCreation();if(currentUser.role==='superuser')setupPasswordReset();await Promise.all([loadUsers(),loadApplications(true)]);}
    if(currentUser.role==='superuser'){document.querySelector('#audit-nav').hidden=false;await loadAudit(true);}
    await loadContent();
    if(courseRoles.includes(currentUser.role))bindCourseBuilder();
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
document.querySelector('#applications-clear').addEventListener('click',()=>{document.querySelector('#application-filters').reset();loadApplications(true);});
document.querySelector('#applications-more').addEventListener('click',()=>loadApplications());
setupNavigation();
init();
