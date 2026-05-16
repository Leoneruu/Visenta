/* ============================
   NAVBAR – scroll state
   ============================ */
const navbar = document.getElementById('navbar');

window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 60);
}, { passive: true });

/* ============================
   HERO VIDEO – smooth scroll-driven playback
   ============================ */
const video = document.getElementById('hero-video');

if (video.readyState >= 1) {
  initScrollVideo();
} else {
  video.addEventListener('loadedmetadata', initScrollVideo, { once: true });
}

function initScrollVideo() {
  video.pause();
  video.currentTime = 0;

  let targetTime = 0;
  let currentTime = 0;
  const SMOOTHING = 0.12;

  function computeTarget() {
    // Full page: scroll 0 → (scrollHeight - innerHeight) maps to 0 → duration
    const maxScroll = Math.max(
      document.documentElement.scrollHeight - window.innerHeight,
      1
    );
    const progress = Math.min(Math.max(window.scrollY / maxScroll, 0), 1);
    targetTime = progress * (video.duration || 0);
  }

  computeTarget();
  currentTime = targetTime;

  window.addEventListener('scroll', computeTarget, { passive: true });
  window.addEventListener('resize', () => {
    computeTarget();   // re-calc after layout reflow
  });

  let seeking = false;

  function tick() {
    if (isFinite(targetTime) && video.duration) {
      currentTime += (targetTime - currentTime) * SMOOTHING;
      if (Math.abs(targetTime - currentTime) < 0.001) {
        currentTime = targetTime;
      }

      if (!seeking) {
        seeking = true;
        video.currentTime = currentTime;
      }
    }
    requestAnimationFrame(tick);
  }

  video.addEventListener('seeked', () => { seeking = false; });

  requestAnimationFrame(tick);
}

/* ============================
   3D TILT EFFECT (instant response, glitch-free)
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
    // If mouse re-entered before reset finished, stop immediately
    if (isOver) {
      rafId = null;
      return;
    }

    currentX += (0 - currentX) * 0.18;
    currentY += (0 - currentY) * 0.18;

    if (Math.abs(currentX) < 0.05 && Math.abs(currentY) < 0.05) {
      currentX = 0;
      currentY = 0;
      card.style.transform = '';
      rafId = null;
      return;
    }

    applyTransform(currentX, currentY);
    rafId = requestAnimationFrame(resetTick);
  }

  card.addEventListener('mouseenter', () => {
    isOver = true;
    // Cancel any in-progress reset
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  });

  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();

    // Guard: ignore events fired just outside the element (browser quirk)
    if (
      e.clientX < rect.left || e.clientX > rect.right ||
      e.clientY < rect.top  || e.clientY > rect.bottom
    ) return;

    const cx = rect.left + rect.width  / 2;
    const cy = rect.top  + rect.height / 2;

    const dx = (e.clientX - cx) / (rect.width  / 2);
    const dy = (e.clientY - cy) / (rect.height / 2);

    currentX = -dy * MAX_TILT;
    currentY =  dx * MAX_TILT;

    applyTransform(currentX, currentY);
  });

  card.addEventListener('mouseleave', (e) => {
    // Verify pointer actually left the element (not just a child boundary)
    const rel = e.relatedTarget;
    if (rel && card.contains(rel)) return;

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
