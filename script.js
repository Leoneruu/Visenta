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

  // Map scroll over the full page height to the video timeline.
  let targetTime = 0;
  let currentTime = 0;
  const SMOOTHING = 0.12; // lerp factor – higher = snappier

  function computeTarget() {
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
  window.addEventListener('resize', computeTarget);

  function tick() {
    if (isFinite(targetTime)) {
      // Smooth lerp toward target
      currentTime += (targetTime - currentTime) * SMOOTHING;

      if (Math.abs(targetTime - currentTime) < 0.001) {
        currentTime = targetTime;
      }

      if (isFinite(currentTime) && video.duration) {
        try {
          video.currentTime = currentTime;
        } catch (e) { /* seek-in-progress – ignore */ }
      }
    }
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

/* ============================
   3D TILT EFFECT (instant response)
   ============================ */
const MAX_TILT = 15;  // degrees

document.querySelectorAll('.tilt-card').forEach(card => {
  let rafId = null;
  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;
  let resetting = false;

  card.style.transition = 'none';
  card.style.willChange = 'transform';

  function applyTransform(rx, ry) {
    card.style.transform =
      `perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg)`;
  }

  function resetTick() {
    currentX += (0 - currentX) * 0.18;
    currentY += (0 - currentY) * 0.18;

    if (Math.abs(currentX) < 0.05 && Math.abs(currentY) < 0.05) {
      card.style.transform = '';
      rafId = null;
      resetting = false;
      return;
    }
    applyTransform(currentX, currentY);
    rafId = requestAnimationFrame(resetTick);
  }

  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const dx = (e.clientX - cx) / (rect.width / 2);
    const dy = (e.clientY - cy) / (rect.height / 2);

    targetY = dx * MAX_TILT;
    targetX = -dy * MAX_TILT;

    // Direct, instant application – no lerp delay while hovering
    currentX = targetX;
    currentY = targetY;

    if (rafId && resetting) {
      cancelAnimationFrame(rafId);
      rafId = null;
      resetting = false;
    }

    applyTransform(currentX, currentY);
  });

  card.addEventListener('mouseleave', () => {
    if (rafId) cancelAnimationFrame(rafId);
    resetting = true;
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
