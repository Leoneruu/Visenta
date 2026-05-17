/* ============================
   NAVBAR – scroll state
   ============================ */
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 60);
}, { passive: true });

/* ============================
   WEBGL BACKGROUND – STABLE FLUIDS + METALLIC TERRAIN
   ============================ */
(function initWebGL() {
  const canvas = document.getElementById('bg-canvas');
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  if (!gl) { canvas.parentElement.style.background = '#101012'; return; }

  const extFloat       = gl.getExtension('OES_texture_float');
  const extFloatLinear = gl.getExtension('OES_texture_float_linear');
  if (!extFloat) { canvas.parentElement.style.background = '#101012'; return; }

  const SIM_W = 256, SIM_H = 256;
  const DPR   = Math.min(window.devicePixelRatio || 1, 1.5);

  /* ── Helpers ─────────────────────────────────────────────────────────── */
  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('Shader:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  function makeProgram(vsSrc, fsSrc) {
    const p = gl.createProgram();
    const vs = compile(gl.VERTEX_SHADER,   vsSrc);
    const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.bindAttribLocation(p, 0, 'a_pos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error('Link:', gl.getProgramInfoLog(p));
      return null;
    }
    return p;
  }

  function createFBO(w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.FLOAT, null);
    const filt = extFloatLinear ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filt);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filt);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok) return null;
    return { fbo, tex };
  }

  /* ── Vertex shader (shared by all passes) ───────────────────────────── */
  const VS = `
    attribute vec2 a_pos;
    varying   vec2 v_uv;
    void main() {
      v_uv = a_pos * 0.5 + 0.5;
      gl_Position = vec4(a_pos, 0.0, 1.0);
    }
  `;

  /* ── Advection pass ─────────────────────────────────────────────────────
       Semi-Lagrangian backtrace: sample u_src at (uv − vel * dt).
       u_decay is applied multiplicatively (handles both velocity damping
       and dye fading in a single pass).                                    */
  const FS_ADVECT = `
    precision highp float;
    varying vec2 v_uv;
    uniform sampler2D u_vel;
    uniform sampler2D u_src;
    uniform float     u_dt;
    uniform float     u_decay;
    void main() {
      vec2 vel  = texture2D(u_vel, v_uv).rg;
      vec2 prev = clamp(v_uv - vel * u_dt, 0.001, 0.999);
      gl_FragColor = texture2D(u_src, prev) * u_decay;
    }
  `;

  /* ── Splat pass ──────────────────────────────────────────────────────────
       Gaussian impulse at u_pos. For the velocity field u_color.rg carries
       the velocity delta; for the dye field u_color.r carries dye amount.
       u_aspect corrects for non-square canvas so splat is circular.        */
  const FS_SPLAT = `
    precision highp float;
    varying vec2 v_uv;
    uniform sampler2D u_src;
    uniform vec2  u_pos;
    uniform vec4  u_color;
    uniform float u_radius;
    uniform float u_aspect;
    void main() {
      vec2  d      = (v_uv - u_pos) * vec2(u_aspect, 1.0);
      float weight = exp(-dot(d, d) / (u_radius * u_radius));
      gl_FragColor = texture2D(u_src, v_uv) + u_color * weight;
    }
  `;

  /* ── Render pass (terrain fBm + fluid dye overlay) ──────────────────────
       The dye field is sampled in 0-1 UV space and added to the terrain
       height value h before the metallic color ramp, so fluid disturbances
       appear as bright raised peaks and dark hollowed troughs.

       All color stops use R == G (strictly neutral cool silver).           */
  const FS_RENDER = `
    precision mediump float;
    varying vec2      v_uv;
    uniform float     u_t;
    uniform float     u_scroll;
    uniform vec2      u_res;
    uniform sampler2D u_dye;

    float hash(vec2 p) {
      p  = fract(p * vec2(127.1, 311.7));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    float vnoise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f*f*f*(f*(f*6.0-15.0)+10.0);
      return mix(
        mix(hash(i),               hash(i+vec2(1.0,0.0)), u.x),
        mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), u.x),
        u.y);
    }
    float fbm(vec2 p) {
      float v=0.0, a=0.5;
      mat2  m=mat2(1.6,1.2,-1.2,1.6);
      for(int i=0;i<5;i++){v+=a*vnoise(p);p=m*p;a*=0.5;}
      return v;
    }
    float rfbm(vec2 p) {
      float v=0.0, a=0.5;
      mat2  m=mat2(1.8,0.9,-0.9,1.8);
      for(int i=0;i<4;i++){
        v+=a*(1.0-abs(vnoise(p)*2.0-1.0));
        p=m*p; a*=0.45;
      }
      return v;
    }

    void main() {
      /* Aspect-corrected terrain UV */
      vec2 uv = v_uv;
      uv.x   *= u_res.x / u_res.y;

      float t = u_t * 0.045 + u_scroll * 6.0;
      vec2  p = uv;
      p.y    += u_scroll * 2.2;

      /* Two-pass domain warp */
      vec2 q = vec2(
        fbm(p*1.8 + vec2(0.00,0.00) + t*0.38),
        fbm(p*1.8 + vec2(5.20,1.30) + t*0.38));
      vec2 r = vec2(
        fbm(p*1.4 + 2.8*q + vec2(1.70,9.20) + t*0.22),
        fbm(p*1.4 + 2.8*q + vec2(8.30,2.80) + t*0.28));

      float hills  = fbm( p*1.2 + 2.5*r + t*0.10);
      float ridges = rfbm(p*2.2 + r*1.8 + t*0.07);
      float h      = hills*0.68 + ridges*0.32;

      /* Fluid dye lifts / depresses terrain height.
         Clamp tightly so the base terrain remains visible. */
      float dye = texture2D(u_dye, v_uv).r;
      h = clamp(h + dye * 0.60, 0.0, 1.0);

      /* Fake surface normal from q warp-gradient */
      vec2  qN     = q - 0.5;
      vec2  qDir   = normalize(qN + vec2(0.001));
      vec2  sunDir = normalize(vec2(0.55, 0.82));
      float diffuse  = dot(qDir, sunDir);
      float specular = pow(pow(max(0.0,diffuse), 6.0), 3.0) * 1.8;
      float rim      = 1.0 - clamp(dot(qDir, vec2(0.0,1.0)), 0.0, 1.0);
      float shade    = 0.30 + 0.70 * clamp(diffuse*0.5+0.5, 0.0, 1.0);

      /* Strictly neutral silver ramp – R == G everywhere */
      vec3 col = vec3(0.063, 0.063, 0.071);
      col = mix(col, vec3(0.118,0.118,0.133), smoothstep(0.06,0.28,h));
      col = mix(col, vec3(0.188,0.188,0.208), smoothstep(0.20,0.46,h));
      col = mix(col, vec3(0.345,0.345,0.369), smoothstep(0.34,0.58,h));
      col = mix(col, vec3(0.502,0.502,0.533), smoothstep(0.50,0.72,h));
      col = mix(col, vec3(0.627,0.627,0.659), smoothstep(0.66,0.82,h));
      col = mix(col, vec3(0.784,0.784,0.808), smoothstep(0.76,0.90,h));
      col = mix(col, vec3(0.910,0.910,0.910), smoothstep(0.84,0.95,h));
      col = mix(col, vec3(1.0,1.0,1.0),
                smoothstep(0.55,1.0,ridges)*specular*0.90);
      col += vec3(0.045,0.045,0.055)*rim*rim*0.35;
      col *= shade;

      /* Micro-contour lines */
      float ct = fract(h*10.0);
      col *= 1.0-(1.0-smoothstep(0.0,0.04,abs(ct-0.5)-0.47))*0.06;

      /* Radial vignette */
      vec2  vUV = v_uv - 0.5;
      float vig = 1.0 - smoothstep(0.28,1.10,length(vUV));
      col *= mix(0.03, 1.0, vig);

      col *= 0.80;
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  /* ── Compile programs ───────────────────────────────────────────────── */
  const progAdvect = makeProgram(VS, FS_ADVECT);
  const progSplat  = makeProgram(VS, FS_SPLAT);
  const progRender = makeProgram(VS, FS_RENDER);
  if (!progAdvect || !progSplat || !progRender) return;

  /* ── Fullscreen quad ────────────────────────────────────────────────── */
  const quadBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER,
    new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

  function bindQuad() {
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  }

  /* ── FBOs ───────────────────────────────────────────────────────────── */
  let vel = [createFBO(SIM_W, SIM_H), createFBO(SIM_W, SIM_H)];
  let dye = [createFBO(SIM_W, SIM_H), createFBO(SIM_W, SIM_H)];

  if (!vel[0] || !vel[1] || !dye[0] || !dye[1]) {
    console.warn('Fluid sim: float FBO not supported');
    return;
  }

  /* Clear all simulation textures to 0 */
  [vel[0], vel[1], dye[0], dye[1]].forEach(f => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, f.fbo);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  });
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  /* ── Canvas/viewport state ──────────────────────────────────────────── */
  let canvasW = 1, canvasH = 1;
  function resize() {
    canvasW = Math.round(window.innerWidth  * DPR);
    canvasH = Math.round(window.innerHeight * DPR);
    canvas.width  = canvasW;
    canvas.height = canvasH;
  }
  resize();
  window.addEventListener('resize', resize);

  /* ── Scroll ─────────────────────────────────────────────────────────── */
  let scrollTarget = 0, scrollSmooth = 0;
  window.addEventListener('scroll', () => {
    scrollTarget = window.scrollY /
      Math.max(document.body.scrollHeight - window.innerHeight, 1);
  }, { passive: true });

  /* ── Mouse / touch tracking ─────────────────────────────────────────── */
  let mouseUV     = [0.5, 0.5];   /* current position in UV [0-1] (Y-up)  */
  let prevMouseUV = [0.5, 0.5];   /* position at previous frame            */
  let mouseActive = false;        /* true once we have received a move event */

  function onPointerMove(cx, cy) {
    prevMouseUV[0] = mouseUV[0];
    prevMouseUV[1] = mouseUV[1];
    mouseUV[0] = cx / window.innerWidth;
    mouseUV[1] = 1.0 - cy / window.innerHeight;  /* flip Y for GL         */
    mouseActive = true;
  }

  window.addEventListener('mousemove',
    (e) => onPointerMove(e.clientX, e.clientY), { passive: true });
  window.addEventListener('touchmove',
    (e) => onPointerMove(e.touches[0].clientX, e.touches[0].clientY),
    { passive: true });

  /* ── Simulation pass helpers ────────────────────────────────────────── */

  /* Advect u_src through u_vel, write to dst */
  function advect(velFBO, srcFBO, dstFBO, dt, decay) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, dstFBO.fbo);
    gl.viewport(0, 0, SIM_W, SIM_H);
    gl.useProgram(progAdvect);
    bindQuad();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, velFBO.tex);
    gl.uniform1i(gl.getUniformLocation(progAdvect, 'u_vel'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, srcFBO.tex);
    gl.uniform1i(gl.getUniformLocation(progAdvect, 'u_src'), 1);
    gl.uniform1f(gl.getUniformLocation(progAdvect, 'u_dt'),    dt);
    gl.uniform1f(gl.getUniformLocation(progAdvect, 'u_decay'), decay);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /* Add a Gaussian impulse to srcFBO, write to dstFBO */
  function splat(srcFBO, dstFBO, posUV, colorVec4, radius) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, dstFBO.fbo);
    gl.viewport(0, 0, SIM_W, SIM_H);
    gl.useProgram(progSplat);
    bindQuad();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcFBO.tex);
    gl.uniform1i( gl.getUniformLocation(progSplat, 'u_src'),    0);
    gl.uniform2f( gl.getUniformLocation(progSplat, 'u_pos'),    posUV[0], posUV[1]);
    gl.uniform4f( gl.getUniformLocation(progSplat, 'u_color'),
                  colorVec4[0], colorVec4[1], colorVec4[2], colorVec4[3]);
    gl.uniform1f( gl.getUniformLocation(progSplat, 'u_radius'), radius);
    gl.uniform1f( gl.getUniformLocation(progSplat, 'u_aspect'), canvasW / canvasH);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /* ── Main render loop ───────────────────────────────────────────────── */
  let lastT = 0;

  /* Physical time constants */
  const VEL_DECAY_TAU = 1.2;   /* velocity e-fold time in seconds          */
  const DYE_DECAY_TAU = 3.5;   /* dye e-fold time in seconds               */
  const VEL_RADIUS    = 0.045; /* velocity splat radius in UV space         */
  const DYE_RADIUS    = 0.065; /* dye splat radius in UV space              */
  const FORCE_SCALE   = 18.0;  /* mouse delta (UV) → velocity field amplitude */
  const DYE_SCALE     = 1.2;   /* dye amount per unit of mouse speed        */

  function tick(ts) {
    const now = ts * 0.001;
    const dt  = Math.min(now - lastT, 0.05);
    lastT = now;

    scrollSmooth += (scrollTarget - scrollSmooth) * 0.055;

    /* Per-frame decay factors derived from continuous time constants */
    const velDecay = Math.exp(-dt / VEL_DECAY_TAU);
    const dyeDecay = Math.exp(-dt / DYE_DECAY_TAU);

    /* 1 — Advect velocity field by itself */
    advect(vel[0], vel[0], vel[1], dt, velDecay);
    const velTmp = vel[0]; vel[0] = vel[1]; vel[1] = velTmp;

    /* 2 — Advect dye through (now-updated) velocity field */
    advect(vel[0], dye[0], dye[1], dt, dyeDecay);
    const dyeTmp = dye[0]; dye[0] = dye[1]; dye[1] = dyeTmp;

    /* 3 — Inject mouse force and dye */
    if (mouseActive) {
      const dx = mouseUV[0] - prevMouseUV[0];
      const dy = mouseUV[1] - prevMouseUV[1];
      const speed = Math.sqrt(dx * dx + dy * dy);

      if (speed > 5e-5) {
        /* Cap delta so fast mouse snaps don't destabilise the sim */
        const cap   = Math.min(speed, 0.06) / speed;
        const vx    = dx * cap * FORCE_SCALE;
        const vy    = dy * cap * FORCE_SCALE;
        const dyeAmt = Math.min(speed * DYE_SCALE * 40.0, 1.6);

        /* Velocity splat */
        splat(vel[0], vel[1], mouseUV, [vx, vy, 0, 0], VEL_RADIUS);
        const vt = vel[0]; vel[0] = vel[1]; vel[1] = vt;

        /* Dye splat */
        splat(dye[0], dye[1], mouseUV, [dyeAmt, 0, 0, 0], DYE_RADIUS);
        const dt2 = dye[0]; dye[0] = dye[1]; dye[1] = dt2;
      }
    }

    /* 4 — Render terrain + dye to screen */
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvasW, canvasH);
    gl.useProgram(progRender);
    bindQuad();

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, dye[0].tex);
    gl.uniform1i(gl.getUniformLocation(progRender, 'u_dye'),    0);
    gl.uniform1f(gl.getUniformLocation(progRender, 'u_t'),      now);
    gl.uniform1f(gl.getUniformLocation(progRender, 'u_scroll'), scrollSmooth);
    gl.uniform2f(gl.getUniformLocation(progRender, 'u_res'),    canvasW, canvasH);
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
