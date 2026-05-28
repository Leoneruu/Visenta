/* ============================
   NAVBAR – scroll state
   ============================ */
const navbar   = document.getElementById('navbar');
const scrollEl = document.getElementById('scroll-container');
scrollEl.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', scrollEl.scrollTop > 60);
}, { passive: true });


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
