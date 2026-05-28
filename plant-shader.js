(function () {
  'use strict';

  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  /* ── Preload plant frames (plant_01.png … plant_10.png) ─────────────────── */
  const FRAME_COUNT = 10;
  const frames = [];

  for (let i = 1; i <= FRAME_COUNT; i++) {
    const img = new Image();
    img.src = 'plant_' + String(i).padStart(2, '0') + '.png';
    frames.push(img);
  }

  /* ── Plant lifecycle constants ───────────────────────────────────────────── */
  const FRAME_MS   = 50;   /* ms per frame → 500 ms total animation            */
  const FADE_MS    = 700;  /* fade-out duration after last frame                */
  const MAX_PLANTS = 40;   /* hard cap – oldest plant evicted when exceeded     */

  /* ── Plant object ────────────────────────────────────────────────────────── */
  function Plant(x, y) {
    this.x          = x;
    this.y          = y;
    this.born       = performance.now();
    this.frameIndex = 0;
    this.opacity    = 1;
    this.dead       = false;
  }

  Plant.prototype.update = function (now) {
    const elapsed = now - this.born;
    const animDur = FRAME_MS * FRAME_COUNT;
    this.frameIndex = Math.min(Math.floor(elapsed / FRAME_MS), FRAME_COUNT - 1);
    if (elapsed < animDur) {
      this.opacity = 1;
    } else {
      this.opacity = Math.max(0, 1 - (elapsed - animDur) / FADE_MS);
      if (this.opacity <= 0) this.dead = true;
    }
  };

  Plant.prototype.draw = function (ctx) {
    const img = frames[this.frameIndex];
    if (!img || !img.complete || !img.naturalWidth) return;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    ctx.globalAlpha              = this.opacity;
    ctx.globalCompositeOperation = 'screen'; /* black = transparent            */
    /* Anchor bottom-center of image to spawn position so plant grows upward   */
    ctx.drawImage(img, this.x - w / 2, this.y - h, w, h);
  };

  /* ── Active plant pool ───────────────────────────────────────────────────── */
  const plants = [];

  function spawn(x, y) {
    if (plants.length >= MAX_PLANTS) plants.shift(); /* evict oldest             */
    plants.push(new Plant(x, y));
  }

  /* ── Pointer / touch tracking ────────────────────────────────────────────── */
  let lastX = -1, lastY = -1, lastSpawn = 0;

  function onMove(cx, cy) {
    const now = performance.now();

    /* Velocity-based spawn interval: fast mouse → shorter gap → more plants   */
    let interval = 160;
    if (lastX >= 0) {
      const dx  = cx - lastX;
      const dy  = cy - lastY;
      const vel = Math.sqrt(dx * dx + dy * dy); /* px per event                 */
      interval  = Math.max(35, 160 - vel * 2.2);
    }

    if (now - lastSpawn >= interval) {
      spawn(cx, cy);
      lastSpawn = now;
    }

    lastX = cx;
    lastY = cy;
  }

  window.addEventListener('mousemove', function (e) {
    onMove(e.clientX, e.clientY);
  }, { passive: true });

  window.addEventListener('touchmove', function (e) {
    var t = e.touches[0];
    onMove(t.clientX, t.clientY);
  }, { passive: true });

  window.addEventListener('touchstart', function (e) {
    var t = e.touches[0];
    lastX = t.clientX;
    lastY = t.clientY;
    spawn(t.clientX, t.clientY);
    lastSpawn = performance.now();
  }, { passive: true });

  /* ── Canvas sizing (width-only resize, fixed height) ─────────────────────── */
  const DPR    = Math.min(window.devicePixelRatio || 1, 1.5);
  const fixedH = window.innerHeight;
  let   lastW  = window.innerWidth;
  let   curW   = lastW;

  function resize() {
    curW          = window.innerWidth;
    canvas.width  = Math.round(curW   * DPR);
    canvas.height = Math.round(fixedH * DPR);
  }
  resize();

  window.addEventListener('resize', function () {
    var nw = window.innerWidth;
    if (nw !== lastW) { lastW = nw; resize(); }
  }, { passive: true });

  /* ── Render loop ─────────────────────────────────────────────────────────── */
  function loop(now) {
    requestAnimationFrame(loop);

    /* Scale context so all coordinates are in logical CSS pixels */
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    /* Background fill */
    ctx.globalAlpha              = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle                = '#080808';
    ctx.fillRect(0, 0, curW, fixedH);

    /* Draw plants back-to-front; dead ones removed in-place */
    for (var i = plants.length - 1; i >= 0; i--) {
      plants[i].update(now);
      if (plants[i].dead) {
        plants.splice(i, 1);
      } else {
        plants[i].draw(ctx);
      }
    }

    /* Restore context state for anything that might read it afterwards */
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha              = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  requestAnimationFrame(loop);
}());
