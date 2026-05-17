/* ============================
   NAVBAR – scroll state
   ============================ */
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 60);
}, { passive: true });

/* ============================
   WEBGL BACKGROUND SHADER
   ============================ */
(function initWebGL() {
  const canvas = document.getElementById('bg-canvas');

  const VS = `
    attribute vec2 a_pos;
    void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
  `;

  /* Domain-warped fBm fluid
     Two uniforms drive the motion:
       u_t      – wall-clock seconds (very slow ambient drift)
       u_scroll – 0..1 scroll progress (main scroll-driven movement) */
  const FS = `
    precision mediump float;
    uniform float u_t;
    uniform float u_scroll;
    uniform vec2  u_res;

    float hash(vec2 p) {
      p  = fract(p * vec2(127.1, 311.7));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    float vnoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i),              hash(i + vec2(1.0, 0.0)), u.x),
        mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), u.x),
        u.y
      );
    }

    /* 4 octaves – good balance of detail vs. fill-rate */
    float fbm(vec2 p) {
      float v = 0.0, a = 0.5;
      mat2  m = mat2(1.6, 1.2, -1.2, 1.6);
      for (int i = 0; i < 4; i++) {
        v += a * vnoise(p);
        p  = m * p;
        a *= 0.5;
      }
      return v;
    }

    void main() {
      vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;

      /* Scroll drives the main phase, real-time adds slow ambient drift */
      float t = u_t * 0.04 + u_scroll * 7.0;

      /* ── Pass 1: warp vector q ──────────────────────────────────────── */
      vec2 q = vec2(
        fbm(uv * 3.0 + vec2(0.00, 0.00) + t * 0.60),
        fbm(uv * 3.0 + vec2(5.20, 1.30) + t * 0.60)
      );

      /* ── Pass 2: warp vector r ──────────────────────────────────────── */
      vec2 r = vec2(
        fbm(uv * 2.5 + 4.0 * q + vec2(1.70, 9.20) + t * 0.35),
        fbm(uv * 2.5 + 4.0 * q + vec2(8.30, 2.80) + t * 0.45)
      );

      /* ── Final density field ────────────────────────────────────────── */
      float f = fbm(uv * 2.0 + 4.0 * r + t * 0.10);

      /* ── Color ramp: near-black → dark navy → purple → blue-white ──── */
      vec3 col = mix(
        vec3(0.008, 0.008, 0.015),
        vec3(0.030, 0.040, 0.100),
        smoothstep(0.0, 1.0, f * 2.5)
      );
      col = mix(col,
        vec3(0.070, 0.050, 0.180),
        smoothstep(0.0, 1.0, f * 1.8 - 0.10)
      );
      col = mix(col,
        vec3(0.480, 0.580, 0.860),
        smoothstep(0.58, 1.0, f * f * 2.9)
      );
      col = mix(col,
        vec3(0.88, 0.93, 1.00),
        smoothstep(0.68, 1.0, f * f * f * 4.2)
      );

      /* Contrast accent from warp magnitude */
      col *= 1.0 - length(r) * 0.22;

      /* Radial vignette – deep black at edges */
      float vig = 1.0 - smoothstep(0.30, 1.15, length(uv));
      col *= mix(0.04, 1.0, vig);

      /* Global brightness cap so white text always reads */
      col *= 0.72;

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  /* ── GL setup ─────────────────────────────────────────────────────── */
  const gl = canvas.getContext('webgl')
          || canvas.getContext('experimental-webgl');

  if (!gl) {
    // WebGL unavailable – show solid dark background
    canvas.parentElement.style.background = '#06060a';
    return;
  }

  function compileShader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:\n' + gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  const prog = gl.createProgram();
  gl.attachShader(prog, compileShader(gl.VERTEX_SHADER,   VS));
  gl.attachShader(prog, compileShader(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('Program link error:\n' + gl.getProgramInfoLog(prog));
    return;
  }
  gl.useProgram(prog);

  /* Fullscreen quad as triangle strip: two triangles covering NDC */
  const quadBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1,-1,  1,-1,  -1,1,  1,1]),
    gl.STATIC_DRAW
  );

  const aPos  = gl.getAttribLocation(prog,  'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uT      = gl.getUniformLocation(prog, 'u_t');
  const uScroll = gl.getUniformLocation(prog, 'u_scroll');
  const uRes    = gl.getUniformLocation(prog, 'u_res');

  /* Cap DPR at 1.5 – background is blurry, full retina res not needed */
  const DPR = Math.min(window.devicePixelRatio || 1, 1.5);

  function resize() {
    canvas.width  = Math.round(window.innerWidth  * DPR);
    canvas.height = Math.round(window.innerHeight * DPR);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uRes, canvas.width, canvas.height);
  }
  resize();
  window.addEventListener('resize', resize);

  /* ── Scroll tracking with lerp ────────────────────────────────────── */
  let scrollTarget = 0;
  let scrollSmooth = 0;

  window.addEventListener('scroll', () => {
    const maxScroll = Math.max(
      document.body.scrollHeight - window.innerHeight, 1
    );
    scrollTarget = window.scrollY / maxScroll;
  }, { passive: true });

  /* ── Render loop ──────────────────────────────────────────────────── */
  function tick(ts) {
    scrollSmooth += (scrollTarget - scrollSmooth) * 0.055;
    gl.uniform1f(uT,      ts * 0.001);
    gl.uniform1f(uScroll, scrollSmooth);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
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

step2Form.addEventListener('submit', (e) => {
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

  renderSuccess();
  showStep('success');
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
  const a    = Object.assign(document.createElement('a'), { href: url, download: 'Visenta-Beratungstermin.ics' });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
});

function escapeICS(str) {
  return (str || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
}
