let csrfToken='';
async function csrf(){const response=await fetch('/api/csrf-token',{credentials:'same-origin'});if(!response.ok)throw new Error('No se pudo iniciar una sesión segura.');csrfToken=(await response.json()).csrfToken;}
document.querySelectorAll('[data-password-form]').forEach(form=>form.addEventListener('submit',async event=>{
  event.preventDefault();if(!form.reportValidity())return;
  const type=form.dataset.passwordForm;const values=Object.fromEntries(new FormData(form));const message=form.querySelector('.form-message');const button=form.querySelector('button');message.className='form-message';
  if(type!=='forgot'&&values.newPassword!==values.confirmation){message.classList.add('error');message.textContent='Las contraseñas no coinciden.';return;}
  delete values.confirmation;if(type==='reset'){values.token=new URLSearchParams(location.search).get('token')||'';}
  const endpoint={forgot:'forgot-password',reset:'reset-password',change:'change-password'}[type];button.disabled=true;
  try{if(!csrfToken)await csrf();const response=await fetch(`/api/auth/${endpoint}`,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-csrf-token':csrfToken},body:JSON.stringify(values)});const data=await response.json();if(!response.ok)throw new Error(data.error||'No fue posible completar la solicitud.');message.classList.add('success');message.textContent=data.message;form.reset();if(type!=='forgot')setTimeout(()=>location.replace('/login.html'),1400);}catch(error){message.classList.add('error');message.textContent=error.message;}finally{button.disabled=false;}
}));
csrf().catch(()=>{});
