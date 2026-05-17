/* ============================
   NAVBAR – scroll state
   ============================ */
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 60);
}, { passive: true });

/* ============================
   WEBGL BACKGROUND – GREEN HILLS + FLUID MOUSE
   ============================ */
(function initWebGL() {
  const canvas = document.getElementById('bg-canvas');

  /* ── Vertex shader ────────────────────────────────────────────────── */
  const VS = `
    attribute vec2 a_pos;
    void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
  `;

  /* ── Fragment shader ──────────────────────────────────────────────────
     Uniforms:
       u_t      – wall-clock seconds        → slow ambient terrain drift
       u_scroll – 0..1 page progress        → fly-over + phase advance
       u_tp[8]  – trail positions (UV)      ┐
       u_tv[8]  – trail velocities (UV/s)   ├ fluid wake system
       u_tt[8]  – trail timestamps (s)      ┘
     ──────────────────────────────────────────────────────────────────── */
  const FS = `
    precision mediump float;

    uniform float u_t;
    uniform float u_scroll;
    uniform vec2  u_res;

    /* Mouse trail – N=8 ring-buffer entries */
    uniform vec2  u_tp[8];
    uniform vec2  u_tv[8];
    uniform float u_tt[8];

    /* ── Value noise (quintic interpolation) ──────────────────────────── */
    float hash(vec2 p) {
      p  = fract(p * vec2(127.1, 311.7));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    float vnoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
      return mix(
        mix(hash(i),               hash(i + vec2(1.0,0.0)), u.x),
        mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), u.x),
        u.y
      );
    }

    /* 5-octave smooth fBm – rolling hills base */
    float fbm(vec2 p) {
      float v = 0.0, a = 0.5;
      mat2  m = mat2(1.6, 1.2, -1.2, 1.6);
      for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = m*p; a *= 0.5; }
      return v;
    }

    /* 4-octave ridged fBm – sharp hilltop crests */
    float rfbm(vec2 p) {
      float v = 0.0, a = 0.5;
      mat2  m = mat2(1.8, 0.9, -0.9, 1.8);
      for (int i = 0; i < 4; i++) {
        v += a * (1.0 - abs(vnoise(p) * 2.0 - 1.0));
        p = m*p; a *= 0.45;
      }
      return v;
    }

    /* ── Fluid wake ───────────────────────────────────────────────────────
         Each trail entry spawns an expanding ring front + directional wake.

         Physics model
         ─────────────
         • Ring radius grows as  r(age) = age × WAVE_SPEED
         • Amplitude peaks when the ring front passes through a pixel:
               ring = exp( -(dist - r(age))² × SHARPNESS )
         • Push direction:
               65% outward (radially away from trail point)  →  ripple
               35% along velocity                            →  directional wake bias
           Together these produce a V-shaped Kelvin-style wake behind the cursor.
         • p -= fluidWake()  →  terrain domain shifted so features appear
           displaced OUTWARD (subtracting moves sampling point inward,
           making terrain visually expand outward from trail).              */
    vec2 fluidWake(vec2 uv) {
      vec2  wake       = vec2(0.0);
      float WAVE_SPEED = 0.42;   /* UV/s  – ring expansion rate          */
      float SHARPNESS  = 48.0;   /* ring edge sharpness                  */
      float DECAY      = 2.3;    /* 1/e time constant for fade (seconds) */
      float AMPLITUDE  = 0.095;  /* max domain displacement              */
      float MAX_AGE    = 2.0;    /* discard trail points older than this  */

      for (int i = 0; i < 8; i++) {
        float age   = u_t - u_tt[i];
        if (age < 0.0 || age > MAX_AGE) continue;

        float speed = length(u_tv[i]);
        if (speed < 0.008) continue;          /* ignore nearly-still points */

        vec2  toPixel = uv - u_tp[i];
        float dist    = length(toPixel);
        vec2  radN    = dist > 0.001 ? toPixel / dist : vec2(0.0, 1.0);
        vec2  velN    = u_tv[i] / speed;

        /* Expanding ring: amplitude peaks at the current wave front */
        float front   = age * WAVE_SPEED;
        float ring    = exp(-pow(dist - front, 2.0) * SHARPNESS);

        /* Temporal + speed fade */
        float fade    = exp(-age * DECAY) * clamp(speed / 0.15, 0.0, 1.0);

        /* Push direction: outward radial + forward velocity bias          */
        /* normalize() prevents magnitude from dominating when mixing      */
        vec2  pushDir = normalize(mix(radN, velN, 0.35));

        wake += pushDir * ring * fade * AMPLITUDE;
      }
      return wake;
    }

    void main() {
      /* Aspect-corrected UV (Y-up, matches trail coordinate system) */
      vec2 uv  = gl_FragCoord.xy / u_res;
      uv.x    *= u_res.x / u_res.y;

      float t  = u_t * 0.045 + u_scroll * 6.0;

      /* Terrain UV: scroll = vertical camera pan */
      vec2 p   = uv;
      p.y     += u_scroll * 2.2;

      /* Apply fluid wake: subtract → terrain visually pushed OUTWARD */
      p       -= fluidWake(uv);

      /* Two-pass domain warp */
      vec2 q = vec2(
        fbm(p * 1.8 + vec2(0.00, 0.00) + t * 0.38),
        fbm(p * 1.8 + vec2(5.20, 1.30) + t * 0.38)
      );
      vec2 r = vec2(
        fbm(p * 1.4 + 2.8*q + vec2(1.70, 9.20) + t * 0.22),
        fbm(p * 1.4 + 2.8*q + vec2(8.30, 2.80) + t * 0.28)
      );

      float hills  = fbm(p * 1.2 + 2.5*r + t * 0.10);
      float ridges = rfbm(p * 2.2 + r * 1.8 + t * 0.07);
      float h      = hills * 0.68 + ridges * 0.32;

      /* Cheap directional shading from q gradient × sun vector */
      vec2  qN    = q - 0.5;
      float sun   = dot(normalize(qN + vec2(0.001)), vec2(0.6, 0.8));
      float shade = 0.72 + 0.28 * clamp(sun, 0.0, 1.0);

      /* Green terrain ramp: deep valley → dark forest → peak → sunlit crest */
      vec3 col = vec3(0.003, 0.014, 0.005);
      col = mix(col, vec3(0.008, 0.042, 0.013), smoothstep(0.06, 0.26, h));
      col = mix(col, vec3(0.022, 0.105, 0.030), smoothstep(0.20, 0.44, h));
      col = mix(col, vec3(0.055, 0.235, 0.065), smoothstep(0.36, 0.60, h));
      col = mix(col, vec3(0.105, 0.400, 0.095), smoothstep(0.52, 0.76, h));
      col = mix(col, vec3(0.185, 0.600, 0.145), smoothstep(0.68, 0.90, h) * ridges);
      col *= shade;

      /* Micro-contour lines */
      float ct = fract(h * 10.0);
      col *= 1.0 - (1.0 - smoothstep(0.0, 0.04, abs(ct - 0.5) - 0.47)) * 0.10;

      /* Radial vignette */
      vec2  vUV = gl_FragCoord.xy / u_res - 0.5;
      float vig = 1.0 - smoothstep(0.28, 1.10, length(vUV));
      col *= mix(0.03, 1.0, vig);

      col *= 0.80;
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  /* ── GL context ───────────────────────────────────────────────────── */
  const gl = canvas.getContext('webgl')
          || canvas.getContext('experimental-webgl');

  if (!gl) { canvas.parentElement.style.background = '#020a03'; return; }

  function compileShader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('Shader:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  const prog = gl.createProgram();
  gl.attachShader(prog, compileShader(gl.VERTEX_SHADER,   VS));
  gl.attachShader(prog, compileShader(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('Link:', gl.getProgramInfoLog(prog)); return;
  }
  gl.useProgram(prog);

  /* Fullscreen quad */
  const quadBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER,
    new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uT         = gl.getUniformLocation(prog, 'u_t');
  const uScroll    = gl.getUniformLocation(prog, 'u_scroll');
  const uRes       = gl.getUniformLocation(prog, 'u_res');
  const uTrailPos  = gl.getUniformLocation(prog, 'u_tp[0]');
  const uTrailVel  = gl.getUniformLocation(prog, 'u_tv[0]');
  const uTrailTime = gl.getUniformLocation(prog, 'u_tt[0]');

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
    scrollTarget = window.scrollY /
      Math.max(document.body.scrollHeight - window.innerHeight, 1);
  }, { passive: true });

  /* ── Trail system ─────────────────────────────────────────────────────
       Ring buffer of N=8 entries. Each entry stores:
         position  – in terrain UV space (aspect-corrected, Y-up)
         velocity  – UV/s
         timestamp – wall-clock seconds

       New entries are added at most every INTERVAL seconds and only
       when the mouse is moving fast enough to produce a visible wake.   */
  const TRAIL_N    = 8;
  const TRAIL_INT  = 0.035;          /* min seconds between trail points */
  const MIN_SPEED  = 0.008;          /* UV/s threshold – ignore tiny jitter */
  const MAX_VEL    = 4.0;            /* UV/s cap to prevent explosion on teleport */

  const trailPos  = new Float32Array(TRAIL_N * 2);  /* [x0,y0, x1,y1, ...] */
  const trailVel  = new Float32Array(TRAIL_N * 2);
  const trailTime = new Float32Array(TRAIL_N).fill(-999); /* far past = inactive */

  let trailHead   = 0;
  let lastTrailT  = -999;

  /* Previous raw mouse position (terrain UV space) for velocity calc */
  let prevUVX = -1;
  let prevUVY = -1;
  let prevMoveT = 0;

  function aspect() { return window.innerWidth / window.innerHeight; }

  function onMouseMove(cx, cy) {
    const now = performance.now() * 0.001;
    const dt  = now - prevMoveT;
    if (dt < 0.004) return;               /* debounce sub-4ms bursts */

    const asp  = aspect();
    const uvx  = (cx / window.innerWidth)  * asp;
    const uvy  = 1.0 - cy / window.innerHeight; /* flip Y for GL */

    if (prevUVX >= 0) {
      const vx  = (uvx - prevUVX) / dt;
      const vy  = (uvy - prevUVY) / dt;
      const spd = Math.sqrt(vx*vx + vy*vy);

      if (spd >= MIN_SPEED && now - lastTrailT >= TRAIL_INT) {
        lastTrailT = now;

        /* Clamp velocity to prevent visual explosions on fast snaps */
        const s = spd > MAX_VEL ? MAX_VEL / spd : 1.0;

        trailPos[trailHead * 2]     = uvx;
        trailPos[trailHead * 2 + 1] = uvy;
        trailVel[trailHead * 2]     = vx * s;
        trailVel[trailHead * 2 + 1] = vy * s;
        trailTime[trailHead]        = now;

        trailHead = (trailHead + 1) % TRAIL_N;
      }
    }

    prevUVX  = uvx;
    prevUVY  = uvy;
    prevMoveT = now;
  }

  window.addEventListener('mousemove', (e) => {
    onMouseMove(e.clientX, e.clientY);
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    onMouseMove(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });

  /* ── Render loop ──────────────────────────────────────────────────── */
  function tick(ts) {
    const now = ts * 0.001;
    scrollSmooth += (scrollTarget - scrollSmooth) * 0.055;

    gl.uniform1f(uT,      now);
    gl.uniform1f(uScroll, scrollSmooth);
    gl.uniform2fv(uTrailPos,  trailPos);
    gl.uniform2fv(uTrailVel,  trailVel);
    gl.uniform1fv(uTrailTime, trailTime);
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
