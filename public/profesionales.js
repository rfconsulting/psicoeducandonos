const typeNames={psychologist:'Psicólogo/a',psychiatrist:'Psiquiatra',psychopedagogue:'Psicopedagogo/a',counselor:'Consejero/a cristiano/a'};
let professionals=[];
let signedInStudent=false;

function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text)node.textContent=text;return node;}
function bookingUrl(id){return signedInStudent?`/estudiante.html?professional=${id}#consultations-panel`:`/registro.html?professional=${id}`;}
function renderProfessionals(){
  const grid=document.querySelector('#professionals-grid');const message=document.querySelector('#professionals-message');grid.textContent='';
  const type=document.querySelector('#professional-filter').value;const visible=professionals.filter(profile=>!type||profile.professionalType===type);
  message.textContent=visible.length?'':professionals.length?'No hay profesionales de esta especialidad por ahora.':'Todavía no hay profesionales con consultas disponibles.';
  visible.forEach(profile=>{
    const card=element('article','professional-public-card');const top=element('div','professional-public-top');
    const avatar=element(profile.hasPhoto?'img':'span','professional-public-avatar');if(profile.hasPhoto){avatar.src=`/api/scheduling/professionals/${profile.id}/public-photo?v=${encodeURIComponent(profile.photoUpdatedAt||'')}`;avatar.alt=`Foto de ${profile.fullName}`;}else{avatar.textContent=profile.fullName.trim().charAt(0).toUpperCase();avatar.setAttribute('aria-hidden','true');}
    const identity=element('div');identity.append(element('span','professional-public-type',typeNames[profile.professionalType]||'Profesional'),element('h3','',profile.fullName));top.append(avatar,identity);card.appendChild(top);
    if(profile.bio)card.appendChild(element('p','professional-public-bio',profile.bio));
    if(profile.specialties){const tags=element('div','professional-public-tags');profile.specialties.split(',').map(item=>item.trim()).filter(Boolean).slice(0,5).forEach(item=>tags.appendChild(element('span','',item)));card.appendChild(tags);}
    const service=profile.services[0];const offer=element('div','professional-public-offer');offer.append(element('strong','',service.name),element('span','',`${service.durationMinutes} min · ${service.prices.map(price=>`${price.currency} ${(Number(price.amountMinor)/100).toFixed(2)}`).join(' / ')}`));card.appendChild(offer);
    const link=element('a','professional-book-link',signedInStudent?'Agendar consulta':'Crear cuenta y agendar');link.href=bookingUrl(profile.id);link.addEventListener('click',()=>localStorage.setItem('bookingProfessionalId',String(profile.id)));link.appendChild(element('span','','↗'));card.appendChild(link);grid.appendChild(card);
  });
}

async function loadProfessionals(){
  const message=document.querySelector('#professionals-message');
  try{const response=await fetch('/api/scheduling/professionals/public');if(!response.ok)throw new Error('No fue posible cargar los profesionales.');professionals=(await response.json()).professionals;renderProfessionals();}
  catch(error){message.textContent=error.message;}
  try{const response=await fetch('/api/auth/me',{credentials:'same-origin'});if(response.ok){const {user}=await response.json();signedInStudent=user.role==='student';renderProfessionals();}}catch{}
}
document.querySelector('#professional-filter').addEventListener('change',renderProfessionals);
loadProfessionals();
