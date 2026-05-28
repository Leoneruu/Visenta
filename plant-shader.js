(function () {
  'use strict';

  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  /* ── Preload plant frames (plant_01.png … plant_10.png) ─────────────────── */
  const FRAME_COUNT = 9;   /* frame_002.jpg … frame_010.jpg */
  const frames = [];

  for (let i = 2; i <= 10; i++) {
    const img = new Image();
    img.src = 'frame_' + String(i).padStart(3, '0') + '.jpg';
    frames.push(img);
  }

  /* ── Plant lifecycle constants ───────────────────────────────────────────── */
  const FRAME_MS   = 160;  /* ms per frame → ~1.4 s total animation             */
  const HOLD_MS    = 2200; /* hold last frame before fading (builds trail)       */
  const FADE_MS    = 1800; /* fade-out after hold                                */
  const SIZE_MIN   = 180;  /* px – smallest plant                                */
  const SIZE_MAX   = 480;  /* px – largest plant                                 */
  const MAX_PLANTS = 80;

  /* ── Plant object ────────────────────────────────────────────────────────── */
  function Plant(x, y) {
    this.x          = x;
    this.y          = y;
    this.born       = performance.now();
    this.size       = SIZE_MIN + Math.random() * (SIZE_MAX - SIZE_MIN);
    this.frameIndex = 0;
    this.opacity    = 1;
    this.dead       = false;
  }

  Plant.prototype.update = function (now) {
    const elapsed = now - this.born;
    const animDur = FRAME_MS * FRAME_COUNT;
    const holdEnd = animDur + HOLD_MS;

    if (elapsed < animDur) {
      /* Playing through frames */
      this.frameIndex = Math.min(Math.floor(elapsed / FRAME_MS), FRAME_COUNT - 1);
      this.opacity    = 1;
    } else if (elapsed < holdEnd) {
      /* Holding last frame – builds up the trail */
      this.frameIndex = FRAME_COUNT - 1;
      this.opacity    = 1;
    } else {
      /* Fading out */
      this.frameIndex = FRAME_COUNT - 1;
      this.opacity    = Math.max(0, 1 - (elapsed - holdEnd) / FADE_MS);
      if (this.opacity <= 0) this.dead = true;
    }
  };

  Plant.prototype.draw = function (ctx) {
    /* Fall back to nearest previous frame if this one is missing */
    let img = frames[this.frameIndex];
    if (!img || !img.complete || !img.naturalWidth) {
      for (let d = 1; d <= this.frameIndex; d++) {
        const fb = frames[this.frameIndex - d];
        if (fb && fb.complete && fb.naturalWidth) { img = fb; break; }
      }
    }
    if (!img || !img.complete || !img.naturalWidth) return;
    const s = this.size;
    ctx.globalAlpha              = this.opacity;
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(img, this.x - s / 2, this.y - s / 2, s, s);
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
    let interval = 60;
    if (lastX >= 0) {
      const dx  = cx - lastX;
      const dy  = cy - lastY;
      const vel = Math.sqrt(dx * dx + dy * dy); /* px per event                 */
      interval  = Math.max(12, 60 - vel * 1.8);
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
