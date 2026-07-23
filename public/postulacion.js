let csrfToken='';
const form=document.querySelector('#application-form');
const attended=document.querySelector('#attended-session');
const feedbackField=document.querySelector('#feedback-field');
async function getCsrf(){const response=await fetch('/api/csrf-token',{credentials:'same-origin'});if(!response.ok)throw new Error('No fue posible iniciar una sesión segura.');csrfToken=(await response.json()).csrfToken;}
attended.addEventListener('change',()=>{feedbackField.hidden=attended.value!=='true';if(feedbackField.hidden)form.elements.sessionFeedback.value='';});
form.addEventListener('submit',async event=>{
  event.preventDefault();if(!form.reportValidity())return;
  const message=form.querySelector('.form-message');const button=form.querySelector('button[type="submit"]');const values=Object.fromEntries(new FormData(form));
  values.crisisExperience=values.crisisExperience==='true';values.attendedInfoSession=values.attendedInfoSession===''?null:values.attendedInfoSession==='true';
  values.privacyConsent=form.elements.privacyConsent.checked;values.supervisionCommitment=form.elements.supervisionCommitment.checked;values.newsletterConsent=form.elements.newsletterConsent.checked;
  message.className='form-message';button.disabled=true;
  try{if(!csrfToken)await getCsrf();const response=await fetch('/api/applications',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-csrf-token':csrfToken},body:JSON.stringify(values)});const data=await response.json();if(!response.ok)throw new Error(data.error||'No fue posible enviar la postulación.');message.classList.add('success');message.textContent=data.message;form.reset();feedbackField.hidden=true;window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'});}catch(error){message.classList.add('error');message.textContent=error.message;csrfToken='';}finally{button.disabled=false;}
});
getCsrf().catch(()=>{});
