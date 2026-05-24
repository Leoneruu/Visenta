/* ============================
   NAVBAR – scroll state
   ============================ */
const navbar   = document.getElementById('navbar');
const scrollEl = document.getElementById('scroll-container');
scrollEl.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', scrollEl.scrollTop > 60);
}, { passive: true });

/* ============================
   FRAME SEQUENCE BACKGROUND
   ezgif-frame-001.jpg … ezgif-frame-097.jpg
   ─────────────────────────────────────────
   All 97 frames preload on page start.
   Progress bar + percentage shown during load.
   After load (or 10 s fallback): loader fades out,
   scroll driver maps scrollY/maxScroll → frame index.
   ============================ */
(function initFrameSeq() {
  const bgCanvas = document.getElementById('bg-canvas');
  const bgCtx    = bgCanvas.getContext('2d');
  const loaderEl = document.getElementById('loading-screen');
  const barFill  = document.getElementById('ref-bar-fill');
  const pctLabel = document.getElementById('ref-pct');

  const TOTAL = 97;
  const frames = new Array(TOTAL);
  const DPR    = Math.min(window.devicePixelRatio || 1, 1.5);

  function pad(n) { return String(n).padStart(3, '0'); }

  const fixedHeight = window.innerHeight;
  let   lastWidth   = window.innerWidth;

  /* ── Canvas sizing (cover) ───────────────────────────────────────────── */
  let lastIdx = 0;

  function resizeBg() {
    bgCanvas.width  = Math.round(window.innerWidth * DPR);
    bgCanvas.height = Math.round(fixedHeight * DPR);
  }
  resizeBg();
  window.addEventListener('resize', () => {
    const newWidth = window.innerWidth;
    if (newWidth !== lastWidth) {
      lastWidth = newWidth;
      resizeBg();
      drawFrame(lastIdx);
    }
  }, { passive: true });

  function drawFrame(idx) {
    const img = frames[idx];
    if (!img || !img.complete || !img.naturalWidth) return;
    lastIdx = idx;
    const cw = bgCanvas.width,  ch = bgCanvas.height;
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const scale = Math.max(cw / iw, ch / ih);
    const dw = iw * scale, dh = ih * scale;
    bgCtx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
  }

  /* ── Progress ────────────────────────────────────────────────────────── */
  function onProgress(pct) {
    const p = Math.round(pct * 100);
    barFill.style.width = p + '%';
    pctLabel.textContent = p + '%';
  }

  /* ── Dismiss ─────────────────────────────────────────────────────────── */
  let dismissed = false;
  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    onProgress(1);
    drawFrame(0);
    loaderEl.classList.add('hidden');
    loaderEl.addEventListener('transitionend', () => {
      if (loaderEl.parentNode) loaderEl.remove();
    }, { once: true });
    startScrollDriver();
  }

  setTimeout(dismiss, 10000);

  /* ── Preload all 97 frames ───────────────────────────────────────────── */
  let settled = 0;
  for (let i = 0; i < TOTAL; i++) {
    const img = new Image();
    img.onload = img.onerror = function () {
      settled++;
      onProgress(settled / TOTAL);
      if (settled === TOTAL) dismiss();
    };
    img.src = `ezgif-frame-${pad(i + 1)}.jpg`;
    frames[i] = img;
  }

  /* ── Scroll driver ───────────────────────────────────────────────────── */
  function startScrollDriver() {
    let targetFrac = 0;
    let smoothFrac = 0;
    let rafId = null;

    scrollEl.addEventListener('scroll', () => {
      const maxScroll = Math.max(scrollEl.scrollHeight - fixedHeight, 1);
      targetFrac = scrollEl.scrollTop / maxScroll;
      if (!rafId) rafId = requestAnimationFrame(tick);
    }, { passive: true });

    function tick() {
      smoothFrac += (targetFrac - smoothFrac) * 0.005;
      if (Math.abs(targetFrac - smoothFrac) * (TOTAL - 1) < 0.5) {
        smoothFrac = targetFrac;
        rafId = null;
      } else {
        rafId = requestAnimationFrame(tick);
      }
      const idx = Math.min(Math.round(smoothFrac * (TOTAL - 1)), TOTAL - 1);
      if (idx !== lastIdx) drawFrame(idx);
    }
  }
}());

/* ============================
   3D TILT  (same as index.html)
   ============================ */
const MAX_TILT = 5;
const MAX_Z    = 22;
const LERP     = 0.4;

document.querySelectorAll('.tilt-card').forEach(card => {
  let targetX = 0, targetY = 0, targetZ = 0;
  let currentX = 0, currentY = 0, currentZ = 0;
  let rafId = null;
  let flatRect = null;

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
    flatRect = card.getBoundingClientRect();
    targetZ  = MAX_Z;
    ensureTick();
  });

  card.addEventListener('mousemove', (e) => {
    const r  = flatRect;
    const dx = (e.clientX - (r.left + r.width  / 2)) / (r.width  / 2);
    const dy = (e.clientY - (r.top  + r.height / 2)) / (r.height / 2);
    targetX =  dy * MAX_TILT;
    targetY = -dx * MAX_TILT;
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
