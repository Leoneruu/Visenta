/* ============================
   NAVBAR – scroll state
   ============================ */
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 60);
}, { passive: true });

/* ============================
   LOADER ANIMATION + BACKGROUND PRELOAD
   ─────────────────────────────────────────────────────────────────────────
   Two independent image sets:

   Loader_001.jpg … Loader_061.jpg  (61 frames)
     Displayed centered on the black loading screen.
     Frame index = round(pct × 60) — frame 1 at 0 %, frame 31 at 50 %,
     frame 61 at 100 %.

   background_001.jpg … background_145.jpg  (145 frames)
     Preloaded in parallel.  Every settled request (success OR error) counts
     toward progress so a 404 never stalls the bar.  When all 145 are
     settled the loader fades out and the scroll driver starts.

   Fallback: a 10 s timeout always dismisses the loader regardless of
   how many frames actually loaded.
   ─────────────────────────────────────────────────────────────────────── */
(function initFrameSeq() {
  /* ── DOM refs ───────────────────────────────────────────────────────── */
  const bgCanvas  = document.getElementById('bg-canvas');
  const bgCtx     = bgCanvas.getContext('2d');
  const ldrCanvas = document.getElementById('loader-canvas');
  const ldrCtx    = ldrCanvas.getContext('2d');
  const loaderEl  = document.getElementById('loading-screen');
  const barFill   = document.getElementById('loader-bar-fill');
  const pctLabel  = document.getElementById('loader-pct');

  /* ── Constants ──────────────────────────────────────────────────────── */
  const BG_TOTAL  = 145;
  const LDR_TOTAL = 61;
  const DPR       = Math.min(window.devicePixelRatio || 1, 1.5);

  /* ── Image stores ───────────────────────────────────────────────────── */
  const bgFrames  = new Array(BG_TOTAL);
  const ldrFrames = new Array(LDR_TOTAL);

  function pad(n) { return String(n).padStart(3, '0'); }

  /* ── Background canvas sizing ───────────────────────────────────────── */
  let bgLastIdx = 0;

  function resizeBg() {
    bgCanvas.width  = Math.round(window.innerWidth  * DPR);
    bgCanvas.height = Math.round(window.innerHeight * DPR);
  }
  resizeBg();
  window.addEventListener('resize', () => { resizeBg(); drawBg(bgLastIdx); });

  /* Cover-fit draw onto background canvas */
  function drawBg(idx) {
    const img = bgFrames[idx];
    if (!img || !img.complete || !img.naturalWidth) return;
    bgLastIdx = idx;
    const cw = bgCanvas.width,  ch = bgCanvas.height;
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const scale = Math.max(cw / iw, ch / ih);
    const dw = iw * scale, dh = ih * scale;
    bgCtx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
  }

  /* ── Loader canvas ──────────────────────────────────────────────────── */
  let ldrSized = false;

  function drawLoader(idx) {
    const img = ldrFrames[idx];
    if (!img || !img.complete || !img.naturalWidth) return;

    /* Size canvas once using 1/3-of-viewport bounds (3× smaller than full) */
    if (!ldrSized) {
      const maxW  = Math.round(window.innerWidth  * 0.15);
      const maxH  = Math.round(window.innerHeight * 0.12);
      const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
      ldrCanvas.width  = Math.round(img.naturalWidth  * scale);
      ldrCanvas.height = Math.round(img.naturalHeight * scale);
      ldrSized = true;
    }

    ldrCtx.clearRect(0, 0, ldrCanvas.width, ldrCanvas.height);
    ldrCtx.drawImage(img, 0, 0, ldrCanvas.width, ldrCanvas.height);
  }

  /* ── Preload loader frames first (61) – bg preload starts only after ── */
  /* All 61 loader frames must be ready before bg preload begins so that   */
  /* onProgress() can always draw the correct frame without a missing-img  */
  /* early-return. onload AND onerror both count so a 404 never stalls it. */
  let ldrSettled = 0;

  function startLoaderPreload() {
    for (let i = 0; i < LDR_TOTAL; i++) {
      const img = new Image();
      img.onload = img.onerror = (function (idx) {
        return function () {
          ldrSettled++;
          /* Show frame 0 as soon as the first image is ready */
          if (ldrSettled === 1 && img.complete && img.naturalWidth) drawLoader(0);
          /* Once all loader frames are settled, kick off bg preload */
          if (ldrSettled === LDR_TOTAL) preloadBg();
        };
      }(i));
      img.src = `Loader_${pad(i + 1)}.jpg`;
      ldrFrames[i] = img;
    }
  }

  /* ── Progress helper – updates bar, label, and loader frame ─────────── */
  function onProgress(pct) {
    const p = Math.round(pct * 100);
    barFill.style.width = p + '%';
    pctLabel.textContent = p + '%';
    const ldrIdx = Math.min(Math.round(pct * (LDR_TOTAL - 1)), LDR_TOTAL - 1);
    drawLoader(ldrIdx);
  }

  /* ── Dismiss loader (runs exactly once) ─────────────────────────────── */
  let dismissed = false;
  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    onProgress(1);          /* ensure bar and label show 100 % */
    drawBg(0);
    loaderEl.classList.add('hidden');
    loaderEl.addEventListener('transitionend', () => {
      if (loaderEl.parentNode) loaderEl.remove();
    }, { once: true });
    startScrollDriver();
  }

  /* 10 s hard fallback */
  setTimeout(dismiss, 10000);

  /* ── Preload background frames (145) ────────────────────────────────── */
  let bgSettled = 0;

  function preloadBg() {
    for (let i = 0; i < BG_TOTAL; i++) {
      const img = new Image();
      /* Both onload and onerror count — a failed frame never stalls progress */
      img.onload = img.onerror = function () {
        bgSettled++;
        onProgress(bgSettled / BG_TOTAL);
        if (bgSettled === BG_TOTAL) dismiss();
      };
      img.src = `background_${pad(i + 1)}.jpg`;
      bgFrames[i] = img;
    }
  }

  startLoaderPreload();

  /* ── Scroll driver ──────────────────────────────────────────────────── */
  function startScrollDriver() {
    let targetFrac = 0;
    let smoothFrac = 0;
    const LERP = 0.12;

    window.addEventListener('scroll', () => {
      const maxScroll = Math.max(document.body.scrollHeight - window.innerHeight, 1);
      targetFrac = window.scrollY / maxScroll;
    }, { passive: true });

    function tick() {
      smoothFrac += (targetFrac - smoothFrac) * LERP;
      const idx = Math.min(Math.round(smoothFrac * (BG_TOTAL - 1)), BG_TOTAL - 1);
      if (idx !== bgLastIdx) drawBg(idx);
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

}());

/* ============================
   3D TILT (glitch-free)
   ============================ */
const MAX_TILT = 15;

document.querySelectorAll('.tilt-card').forEach(card => {
  let rafId = null;
  let currentX = 0;
  let currentY = 0;
  let isOver = false;

  card.style.willChange = 'transform';

  function applyTransform(rx, ry) {
    card.style.transform =
      `perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg)`;
  }

  function resetTick() {
    if (isOver) { rafId = null; return; }
    currentX += (0 - currentX) * 0.18;
    currentY += (0 - currentY) * 0.18;
    if (Math.abs(currentX) < 0.05 && Math.abs(currentY) < 0.05) {
      currentX = 0; currentY = 0;
      card.style.transform = '';
      rafId = null;
      return;
    }
    applyTransform(currentX, currentY);
    rafId = requestAnimationFrame(resetTick);
  }

  card.addEventListener('mouseenter', () => {
    isOver = true;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  });

  card.addEventListener('mousemove', (e) => {
    const r = card.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right ||
        e.clientY < r.top  || e.clientY > r.bottom) return;
    const dx = (e.clientX - (r.left + r.width  / 2)) / (r.width  / 2);
    const dy = (e.clientY - (r.top  + r.height / 2)) / (r.height / 2);
    currentX = -dy * MAX_TILT;
    currentY =  dx * MAX_TILT;
    applyTransform(currentX, currentY);
  });

  card.addEventListener('mouseleave', (e) => {
    if (e.relatedTarget && card.contains(e.relatedTarget)) return;
    isOver = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(resetTick);
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
