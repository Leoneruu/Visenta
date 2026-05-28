/* ============================
   NAVBAR – scroll state
   ============================ */
const navbar    = document.getElementById('navbar');
const scrollEl  = document.getElementById('scroll-container');
scrollEl.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', scrollEl.scrollTop > 60);
}, { passive: true });


/* ============================
   3D TILT
   Card lifts toward viewer (translateZ) + subtle tilt toward mouse.
   MAX_TILT kept low so the far edge stays net-positive in Z.
   Single RAF loop lerps all three values every frame.
   ============================ */
const MAX_TILT = 5;   // degrees – subtle tilt
const MAX_Z    = 22;  // px forward lift
const LERP     = 0.4; // fast enough to feel instant, smooth enough not to snap

document.querySelectorAll('.tilt-card').forEach(card => {
  let targetX = 0, targetY = 0, targetZ = 0;
  let currentX = 0, currentY = 0, currentZ = 0;
  let rafId = null;
  let flatRect = null; // card bounds captured while still flat (no transform)

  card.style.willChange      = 'transform';
  card.style.transformOrigin = 'center center';

  function applyTransform() {
    card.style.transform =
      `perspective(900px) translateZ(${currentZ.toFixed(2)}px) ` +
      `rotateX(${currentX.toFixed(3)}deg) rotateY(${currentY.toFixed(3)}deg)`;
  }

  function tick() {
    currentX += (targetX - currentX) * LERP;
    currentY += (targetY - currentY) * LERP;
    currentZ += (targetZ - currentZ) * LERP;

    const done =
      Math.abs(targetX - currentX) < 0.01 &&
      Math.abs(targetY - currentY) < 0.01 &&
      Math.abs(targetZ - currentZ) < 0.05;

    if (done) {
      currentX = targetX; currentY = targetY; currentZ = targetZ;
      if (targetZ === 0) { card.style.transform = ''; }
      else               { applyTransform(); }
      rafId = null;
      return;
    }

    applyTransform();
    rafId = requestAnimationFrame(tick);
  }

  function ensureTick() {
    if (!rafId) rafId = requestAnimationFrame(tick);
  }

  card.addEventListener('mouseenter', () => {
    // Capture the untransformed layout rect now, while card is still flat.
    // getBoundingClientRect() during active tilt returns the visually projected
    // rect (slightly enlarged/shifted by translateZ + perspective), which would
    // make dx/dy smaller for cards farther from the viewport centre.
    flatRect = card.getBoundingClientRect();
    targetZ = MAX_Z;
    ensureTick();
  });

  card.addEventListener('mousemove', (e) => {
    const r  = flatRect;
    const dx = (e.clientX - (r.left + r.width  / 2)) / (r.width  / 2);
    const dy = (e.clientY - (r.top  + r.height / 2)) / (r.height / 2);
    targetX =  dy * MAX_TILT;  // mouse up   → top forward
    targetY = -dx * MAX_TILT;  // mouse right → right forward
    targetZ = MAX_Z;
    ensureTick();
  });

  card.addEventListener('mouseleave', (e) => {
    if (e.relatedTarget && card.contains(e.relatedTarget)) return;
    flatRect = null;
    targetX = 0; targetY = 0; targetZ = 0;
    ensureTick();
  });
});

/* ============================
   SCROLL REVEAL
   ============================ */
const revealTargets = [
  ...document.querySelectorAll('.section-header'),
  ...document.querySelectorAll('.tilt-card'),
  ...document.querySelectorAll('.about-text'),
  ...document.querySelectorAll('.footer-cta-label, .footer-cta-title, .footer-cta-sub, .btn-footer'),
];
revealTargets.forEach(el => el.classList.add('reveal'));

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });
revealTargets.forEach(el => revealObserver.observe(el));

/* ============================
   NAV BRAND – scroll to top
   ============================ */
document.getElementById('nav-brand-link').addEventListener('click', (e) => {
  e.preventDefault();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

/* ============================
   MODAL CONTACT FORM
   ============================ */
const modal       = document.getElementById('contact-modal');
const modalSteps  = modal.querySelectorAll('.modal-step');
const progressEl  = document.getElementById('modal-progress');
const progressFill= document.getElementById('progress-fill');
const progressLbl = document.getElementById('progress-label');
const slotsGrid   = document.getElementById('slots-grid');
const summaryList = document.getElementById('success-summary');

const step1Form = document.getElementById('step1-form');
const step2Form = document.getElementById('step2-form');

const formData = {
  company: '', contact: '', email: '', phone: '', website: '',
  types: [], description: '',
  slotISO: '', slotLabel: ''
};

document.querySelectorAll('.js-open-modal').forEach(btn => {
  btn.addEventListener('click', openModal);
});
document.querySelectorAll('.js-close-modal').forEach(btn => {
  btn.addEventListener('click', closeModal);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
});

function openModal() {
  buildSlots();
  showStep(1);
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  setTimeout(() => {
    const first = modal.querySelector('.modal-step.active input');
    if (first) first.focus();
  }, 200);
}

function closeModal() {
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  setTimeout(resetModal, 300);
}

function resetModal() {
  step1Form.reset();
  step2Form.reset();
  document.querySelectorAll('.slot-btn.selected').forEach(b => b.classList.remove('selected'));
  Object.assign(formData, {
    company: '', contact: '', email: '', phone: '', website: '',
    types: [], description: '', slotISO: '', slotLabel: ''
  });
  showStep(1);
}

function showStep(step) {
  modalSteps.forEach(s => s.classList.remove('active'));
  if (step === 'success') {
    modal.querySelector('[data-step="success"]').classList.add('active');
    progressEl.classList.add('hidden');
  } else {
    modal.querySelector(`[data-step="${step}"]`).classList.add('active');
    progressEl.classList.remove('hidden');
    progressFill.style.width = (step === 1 ? 50 : 100) + '%';
    progressLbl.textContent = `Schritt ${step} von 2`;
  }
}

step1Form.addEventListener('submit', (e) => {
  e.preventDefault();
  const fd = new FormData(step1Form);
  let valid = true;

  step1Form.querySelectorAll('input').forEach(inp => inp.classList.remove('invalid'));

  ['company', 'contact', 'email', 'phone'].forEach(name => {
    const val = (fd.get(name) || '').toString().trim();
    if (!val || (name === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val))) {
      step1Form.querySelector(`[name="${name}"]`).classList.add('invalid');
      valid = false;
    }
  });

  if (!valid) return;

  formData.company = fd.get('company').toString().trim();
  formData.contact = fd.get('contact').toString().trim();
  formData.email   = fd.get('email').toString().trim();
  formData.phone   = fd.get('phone').toString().trim();
  formData.website = (fd.get('website') || '').toString().trim();

  showStep(2);
});

document.querySelector('.js-back-step').addEventListener('click', () => showStep(1));

step2Form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(step2Form);

  formData.types       = fd.getAll('type');
  formData.description = (fd.get('description') || '').toString().trim();

  if (!formData.slotISO) {
    alert('Bitte einen Termin auswählen.');
    return;
  }
  if (!fd.get('privacy')) {
    alert('Bitte die Datenschutzerklärung akzeptieren.');
    return;
  }

  const submitBtn = step2Form.querySelector('[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Wird gesendet…';

  try {
    const res = await fetch('https://formspree.io/f/xzdwrbnj', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        'Firma':             formData.company,
        'Ansprechpartner':   formData.contact,
        'E-Mail':            formData.email,
        'Telefon':           formData.phone,
        'Website':           formData.website,
        'Projekt-Typ':       formData.types.join(', '),
        'Beschreibung':      formData.description,
        'Wunschtermin':      formData.slotLabel,
      }),
    });

    if (res.ok) {
      renderSuccess();
      showStep('success');
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Fehler beim Senden. Bitte versuche es später erneut.');
    }
  } catch {
    alert('Netzwerkfehler. Bitte überprüfe deine Verbindung und versuche es erneut.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Beratungstermin anfragen';
  }
});

function renderSuccess() {
  summaryList.innerHTML = `
    <li><span>Firma</span><span>${escapeHTML(formData.company)}</span></li>
    <li><span>Termin</span><span>${escapeHTML(formData.slotLabel)}</span></li>
    <li><span>E-Mail</span><span>${escapeHTML(formData.email)}</span></li>
  `;
}

function escapeHTML(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

/* ============================
   SLOTS – next 4 weekdays Mon–Thu
   ============================ */
const DAY_NAMES = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
const TIME_SLOTS = ['10:00', '13:00', '15:00'];

function buildSlots() {
  slotsGrid.innerHTML = '';
  nextWeekdays(4).forEach(date => {
    const dayCell = document.createElement('div');
    dayCell.className = 'slot-day';
    const dateStr = date.toLocaleDateString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
    dayCell.innerHTML = `${DAY_NAMES[date.getDay()]}<span>${dateStr}</span>`;

    const timesCell = document.createElement('div');
    timesCell.className = 'slot-times';

    TIME_SLOTS.forEach(t => {
      const [h, m] = t.split(':').map(Number);
      const dt = new Date(date);
      dt.setHours(h, m, 0, 0);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'slot-btn';
      btn.textContent = t + ' Uhr';
      btn.dataset.iso   = dt.toISOString();
      btn.dataset.label = `${DAY_NAMES[date.getDay()]}, ${dateStr} um ${t} Uhr`;

      btn.addEventListener('click', () => {
        document.querySelectorAll('.slot-btn.selected').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        formData.slotISO   = btn.dataset.iso;
        formData.slotLabel = btn.dataset.label;
      });

      timesCell.appendChild(btn);
    });

    slotsGrid.appendChild(dayCell);
    slotsGrid.appendChild(timesCell);
  });
}

function nextWeekdays(count) {
  const out = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  while (out.length < count) {
    const dow = d.getDay();
    if (dow >= 1 && dow <= 4) out.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/* ============================
   ICS DOWNLOAD
   ============================ */
document.getElementById('download-ics').addEventListener('click', () => {
  if (!formData.slotISO) return;
  const start = new Date(formData.slotISO);
  const end   = new Date(start.getTime() + 45 * 60 * 1000);
  const fmt = d => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0',
    'PRODID:-//Visenta//Beratungstermin//DE',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:visenta-${start.getTime()}@visenta.de`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    'SUMMARY:Visenta – Kostenlose Erstberatung',
    `DESCRIPTION:Erstberatung mit ${escapeICS(formData.contact)} (${escapeICS(formData.company)}). Per Video oder Telefon.`,
    'LOCATION:Online (Video / Telefon)',
    'STATUS:TENTATIVE',
    'END:VEVENT', 'END:VCALENDAR'
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'),
                { href: url, download: 'Visenta-Beratungstermin.ics' });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
});

function escapeICS(str) {
  return (str || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
}

/* ============================
   HAMBURGER MENU
   ============================ */
(function initHamburger() {
  const btn  = document.getElementById('hamburger');
  const menu = document.getElementById('mobile-menu');
  if (!btn || !menu) return;

  function openMenu() {
    btn.classList.add('open');
    menu.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    menu.setAttribute('aria-hidden', 'false');
  }

  function closeMenu() {
    btn.classList.remove('open');
    menu.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    menu.setAttribute('aria-hidden', 'true');
  }

  btn.addEventListener('click', () => {
    btn.classList.contains('open') ? closeMenu() : openMenu();
  });

  menu.querySelectorAll('.mobile-menu-link:not(.nav-disabled)').forEach(link => {
    link.addEventListener('click', closeMenu);
  });

  document.addEventListener('click', (e) => {
    if (!btn.contains(e.target) && !menu.contains(e.target)) closeMenu();
  });
}());
