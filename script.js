/* ============================
   NAVBAR – scroll state
   ============================ */
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 60);
}, { passive: true });

/* ============================
   WEBGL BACKGROUND – GREEN HILLS SHADER
   ============================ */
(function initWebGL() {
  const canvas = document.getElementById('bg-canvas');

  /* ── Vertex shader: fullscreen triangle strip ─────────────────────── */
  const VS = `
    attribute vec2 a_pos;
    void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
  `;

  /* ── Fragment shader ──────────────────────────────────────────────────
       Three uniforms drive the scene:
         u_t      – wall-clock seconds  → slow ambient drift
         u_scroll – 0..1 page progress  → fly-over movement + phase advance
         u_mouse  – 0..1 cursor x/y     → subtle terrain pull toward cursor
     ──────────────────────────────────────────────────────────────────── */
  const FS = `
    precision mediump float;

    uniform float u_t;
    uniform float u_scroll;
    uniform vec2  u_mouse;
    uniform vec2  u_res;

    /* ── Noise primitives ─────────────────────────────────────────────── */
    float hash(vec2 p) {
      p  = fract(p * vec2(127.1, 311.7));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    float vnoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      /* quintic interpolation for smoother look than cubic */
      vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
      return mix(
        mix(hash(i),               hash(i + vec2(1.0, 0.0)), u.x),
        mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), u.x),
        u.y
      );
    }

    /* Standard fBm – 5 octaves for smooth rolling hills */
    float fbm(vec2 p) {
      float v = 0.0, a = 0.5;
      mat2  m = mat2(1.6, 1.2, -1.2, 1.6); /* rotation to avoid axis alignment */
      for (int i = 0; i < 5; i++) {
        v += a * vnoise(p);
        p  = m * p;
        a *= 0.5;
      }
      return v;
    }

    /* Ridged fBm – inverts valleys into sharp crests, giving hill-ridge look */
    float rfbm(vec2 p) {
      float v = 0.0, a = 0.5;
      mat2  m = mat2(1.8, 0.9, -0.9, 1.8);
      for (int i = 0; i < 4; i++) {
        float n = vnoise(p);
        v += a * (1.0 - abs(n * 2.0 - 1.0)); /* tent → ridge at n=0.5 */
        p  = m * p;
        a *= 0.45;
      }
      return v;
    }

    void main() {
      /* Aspect-correct UV, Y-up */
      vec2 uv = gl_FragCoord.xy / u_res;
      uv.x   *= u_res.x / u_res.y;

      /* ── Mouse influence ──────────────────────────────────────────────
           Convert 0..1 → -0.5..+0.5. Apply a soft radial falloff so
           the pull is strongest near the cursor and fades at the edges. */
      vec2  mUV   = vec2(u_mouse.x * u_res.x / u_res.y, u_mouse.y);
      vec2  mDelta = mUV - uv;
      float mDist  = length(mDelta);
      /* Gaussian-ish pull: terrain domain is nudged 0..±0.12 toward cursor */
      vec2  mouseWarp = mDelta * 0.12 * exp(-mDist * mDist * 4.0);

      /* ── Time: real-time ambient + scroll-driven phase ─────────────── */
      float t = u_t * 0.045 + u_scroll * 6.0;

      /* ── Terrain UV: scroll shifts Y (fly-over), mouse warps locally ─ */
      vec2 p = uv;
      p.y   += u_scroll * 2.2;   /* vertical camera pan */
      p     -= mouseWarp;        /* pull terrain toward cursor */

      /* ── Domain warp: two-pass, gives organic non-repetitive shapes ── */
      vec2 q = vec2(
        fbm(p * 1.8 + vec2(0.00, 0.00) + t * 0.38),
        fbm(p * 1.8 + vec2(5.20, 1.30) + t * 0.38)
      );
      vec2 r = vec2(
        fbm(p * 1.4 + 2.8 * q + vec2(1.70, 9.20) + t * 0.22),
        fbm(p * 1.4 + 2.8 * q + vec2(8.30, 2.80) + t * 0.28)
      );

      /* ── Height field: blend smooth hills + sharp ridges ───────────── */
      float hills  = fbm(p * 1.2 + 2.5 * r + t * 0.10);
      float ridges = rfbm(p * 2.2 + r * 1.8 + t * 0.07);
      float h      = hills * 0.68 + ridges * 0.32;

      /* ── Fake directional lighting from top-right ─────────────────────
           Use q as a rough surface-gradient estimate; dot against a sun
           vector gives cheap Lambertian-style shading with no extra samples. */
      vec2  qN    = q - vec2(0.5);      /* center q around zero */
      float sun   = dot(normalize(qN + vec2(0.001)), vec2(0.6, 0.8));
      float shade = 0.72 + 0.28 * clamp(sun, 0.0, 1.0);

      /* ── Green terrain color ramp ─────────────────────────────────────
           near-black at valley → dark forest → hillside → vivid peak     */
      vec3 cValley = vec3(0.003, 0.014, 0.005);
      vec3 cFloor  = vec3(0.008, 0.042, 0.013);
      vec3 cForest = vec3(0.022, 0.105, 0.030);
      vec3 cHill   = vec3(0.055, 0.235, 0.065);
      vec3 cPeak   = vec3(0.105, 0.400, 0.095);
      vec3 cCrest  = vec3(0.185, 0.600, 0.145);

      vec3 col = cValley;
      col = mix(col, cFloor,  smoothstep(0.06, 0.26, h));
      col = mix(col, cForest, smoothstep(0.20, 0.44, h));
      col = mix(col, cHill,   smoothstep(0.36, 0.60, h));
      col = mix(col, cPeak,   smoothstep(0.52, 0.76, h));
      col = mix(col, cCrest,  smoothstep(0.68, 0.90, h) * ridges);

      /* Apply directional shading */
      col *= shade;

      /* Micro-contour lines: very subtle striations across the terrain */
      float contour = fract(h * 10.0);
      float line    = 1.0 - smoothstep(0.0, 0.04, abs(contour - 0.5) - 0.47);
      col *= 1.0 - line * 0.10;

      /* ── Vignette: radial darkening toward edges ────────────────────── */
      vec2  vUV = gl_FragCoord.xy / u_res - 0.5;
      float vig = 1.0 - smoothstep(0.28, 1.10, length(vUV));
      col *= mix(0.03, 1.0, vig);

      /* ── Global brightness cap: keeps white text readable ───────────── */
      col *= 0.80;

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  /* ── GL context ───────────────────────────────────────────────────── */
  const gl = canvas.getContext('webgl')
          || canvas.getContext('experimental-webgl');

  if (!gl) {
    canvas.parentElement.style.background = '#020a03';
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

  /* Fullscreen quad – two triangles as a strip */
  const quadBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER,
    new Float32Array([-1,-1,  1,-1,  -1,1,  1,1]),
    gl.STATIC_DRAW
  );
  const aPos = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uT      = gl.getUniformLocation(prog, 'u_t');
  const uScroll = gl.getUniformLocation(prog, 'u_scroll');
  const uMouse  = gl.getUniformLocation(prog, 'u_mouse');
  const uRes    = gl.getUniformLocation(prog, 'u_res');

  /* Background is organic/blurry – cap DPR to save fill-rate */
  const DPR = Math.min(window.devicePixelRatio || 1, 1.5);

  function resize() {
    canvas.width  = Math.round(window.innerWidth  * DPR);
    canvas.height = Math.round(window.innerHeight * DPR);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uRes, canvas.width, canvas.height);
  }
  resize();
  window.addEventListener('resize', resize);

  /* ── Scroll tracking ──────────────────────────────────────────────── */
  let scrollTarget = 0;
  let scrollSmooth = 0;

  window.addEventListener('scroll', () => {
    const maxScroll = Math.max(
      document.body.scrollHeight - window.innerHeight, 1
    );
    scrollTarget = window.scrollY / maxScroll;
  }, { passive: true });

  /* ── Mouse tracking (lerped for smoothness) ───────────────────────── */
  /* Start centered so there's no jump before first mousemove */
  let mouseTarget = { x: 0.5, y: 0.5 };
  let mouseSmooth = { x: 0.5, y: 0.5 };

  window.addEventListener('mousemove', (e) => {
    mouseTarget.x =        e.clientX / window.innerWidth;
    mouseTarget.y = 1.0 - (e.clientY / window.innerHeight); /* flip Y for GL */
  }, { passive: true });

  /* Touch support: treat first touch as mouse */
  window.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    mouseTarget.x =        t.clientX / window.innerWidth;
    mouseTarget.y = 1.0 - (t.clientY / window.innerHeight);
  }, { passive: true });

  /* ── Render loop ──────────────────────────────────────────────────── */
  function tick(ts) {
    const k = 0.055; /* lerp factor – smaller = smoother/lazier */
    scrollSmooth  += (scrollTarget  - scrollSmooth)  * k;
    mouseSmooth.x += (mouseTarget.x - mouseSmooth.x) * k * 0.7;
    mouseSmooth.y += (mouseTarget.y - mouseSmooth.y) * k * 0.7;

    gl.uniform1f(uT,      ts * 0.001);
    gl.uniform1f(uScroll, scrollSmooth);
    gl.uniform2f(uMouse,  mouseSmooth.x, mouseSmooth.y);
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
