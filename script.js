/* ============================
   NAVBAR – scroll state
   ============================ */
const navbar = document.getElementById('navbar');

window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 60);
}, { passive: true });

/* ============================
   HERO VIDEO – scroll-driven playback
   ============================ */
const video = document.getElementById('hero-video');

video.addEventListener('loadedmetadata', initScrollVideo);

if (video.readyState >= 1) {
  initScrollVideo();
}

function initScrollVideo() {
  video.pause();
  video.currentTime = 0;

  let ticking = false;

  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(updateVideo);
      ticking = true;
    }
  }, { passive: true });

  function updateVideo() {
    const hero = document.getElementById('hero');
    const heroHeight = hero.offsetHeight;
    const scrolled = window.scrollY;

    // Map scroll 0 → heroHeight to video 0 → duration
    const progress = Math.min(scrolled / heroHeight, 1);
    const targetTime = progress * video.duration;

    if (isFinite(targetTime)) {
      video.currentTime = targetTime;
    }

    ticking = false;
  }
}

/* ============================
   3D TILT EFFECT
   ============================ */
const MAX_TILT = 15;  // degrees

document.querySelectorAll('.tilt-card').forEach(card => {
  let rafId = null;
  let currentX = 0;
  let currentY = 0;
  let targetX = 0;
  let targetY = 0;
  let isHovered = false;

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function animate() {
    currentX = lerp(currentX, targetX, 0.1);
    currentY = lerp(currentY, targetY, 0.1);

    card.style.transform = `perspective(800px) rotateX(${currentX}deg) rotateY(${currentY}deg)`;

    const diffX = Math.abs(currentX - targetX);
    const diffY = Math.abs(currentY - targetY);

    if (isHovered || diffX > 0.01 || diffY > 0.01) {
      rafId = requestAnimationFrame(animate);
    } else {
      card.style.transform = '';
      rafId = null;
    }
  }

  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const dx = (e.clientX - cx) / (rect.width / 2);
    const dy = (e.clientY - cy) / (rect.height / 2);

    targetY = dx * MAX_TILT;
    targetX = -dy * MAX_TILT;

    if (!rafId) {
      rafId = requestAnimationFrame(animate);
    }
  });

  card.addEventListener('mouseenter', () => {
    isHovered = true;
  });

  card.addEventListener('mouseleave', () => {
    isHovered = false;
    targetX = 0;
    targetY = 0;

    if (!rafId) {
      rafId = requestAnimationFrame(animate);
    }
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
