const menuButton = document.querySelector('.menu-button');
const nav = document.querySelector('.site-header nav');

menuButton.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
});

nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  nav.classList.remove('open');
  menuButton.setAttribute('aria-expanded', 'false');
}));

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll('.reveal').forEach(element => observer.observe(element));
document.querySelector('#year').textContent = new Date().getFullYear();

document.querySelector('#calendar-button').addEventListener('click', () => {
  const content = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Psicoeducandonos//Presentacion Diplomado//ES',
    'BEGIN:VEVENT',
    'UID:presentacion-diplomado-20260727@psicoeducandonos',
    'DTSTAMP:20260701T120000Z',
    'DTSTART:20260728T000000Z',
    'DTEND:20260728T013000Z',
    'SUMMARY:Presentación del Diplomado en Acompañamiento en Crisis',
    'DESCRIPTION:Presentación del proyecto completo de acompañamiento en crisis, trauma y salud mental comunitaria desde una perspectiva cristiana.',
    'LOCATION:Encuentro online',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'presentacion-diplomado-psicoeducandonos.ics';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
});
