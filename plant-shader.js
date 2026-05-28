(function () {
  'use strict';

  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;

  const gl = canvas.getContext('webgl', {
    alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false
  });
  if (!gl) return;

  /* ── Shaders ──────────────────────────────────────────────────────────── */

  const VERT_SRC = `
    attribute vec2 a;
    varying   vec2 v;
    void main() { v = a * .5 + .5; gl_Position = vec4(a, 0., 1.); }
  `;

  /* Simulation: ping-pong state. Each texel: r=vitality, g=color-noise, b=detail-noise */
  const SIM_SRC = `
    precision highp float;
    uniform sampler2D S;
    uniform vec2  R;
    uniform vec2  M;
    uniform float VL;
    uniform float T;
    float rng(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
    void main() {
      vec2 px = 1.0/R;
      vec2 uv = gl_FragCoord.xy / R;
      vec4 cur = texture2D(S, uv);
      float v = cur.r;

      /* Sample neighbours below (plant grows upward) */
      float b0 = texture2D(S, uv + vec2(0.0,      -px.y * 1.8)).r;
      float b1 = texture2D(S, uv + vec2(-px.x,     -px.y      )).r;
      float b2 = texture2D(S, uv + vec2( px.x,     -px.y      )).r;
      float b3 = texture2D(S, uv + vec2(-px.x*2.5, -px.y*0.5  )).r;
      float b4 = texture2D(S, uv + vec2( px.x*2.5, -px.y*0.5  )).r;

      /* Stochastic lateral branching */
      float n1 = rng(uv + fract(T * 0.13 + 1.7));
      float grow = max(b0 * 0.80, max(b1 * 0.60, b2 * 0.60));
      if (n1 > 0.76) grow = max(grow, b3 * 0.45);
      if (n1 < 0.24) grow = max(grow, b4 * 0.45);
      grow *= step(0.14, grow);

      /* Growth suppressed where already dense */
      float space = 1.0 - smoothstep(0.22, 0.68, v);
      float add   = grow * 0.38 * space;

      /* Mouse seeding */
      float md   = length(uv - M);
      float seed = smoothstep(0.10, 0.0, md) * VL * 3.0;

      /* Update vitality with decay */
      float nv = clamp(v + add + seed, 0.0, 1.0) * 0.962;

      /* Assign noise channels once when a cell first activates */
      float nc = (v < 0.04 && nv >= 0.04) ? rng(uv * 19.3 + T * 0.21) : cur.g;
      float nd = (v < 0.04 && nv >= 0.04) ? rng(uv *  7.7 + T * 0.37) : cur.b;

      gl_FragColor = vec4(nv, nc, nd, 1.0);
    }
  `;

  /* Display: upscale sim texture → screen colors */
  const DISP_SRC = `
    precision mediump float;
    uniform sampler2D S;
    uniform vec2 DR;
    float rng(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
    void main() {
      vec2 uv  = gl_FragCoord.xy / DR;
      vec4 st  = texture2D(S, uv);
      float v  = st.r;
      float nc = st.g;
      float nd = st.b;

      vec3 bg  = vec3(0.031);
      vec3 c0  = vec3(0.110, 0.250, 0.065);
      vec3 c1  = vec3(0.176, 0.541, 0.118);
      vec3 c2  = vec3(0.298, 0.686, 0.188);
      vec3 c3  = vec3(0.494, 0.851, 0.290);
      vec3 c4  = vec3(0.72,  0.96,  0.50 );

      float t  = smoothstep(0.00, 0.25, v);
      float t2 = smoothstep(0.25, 0.60, v);
      float t3 = smoothstep(0.60, 1.00, v);

      vec3 pc = mix(c0, c1, t);
      pc = mix(pc, c2, t2);
      pc = mix(pc, c3 + (c4 - c3) * t3 * 0.6, t3);

      /* Leaf highlight pattern */
      vec2  cell = floor(uv * 26.0 + nc * 6.0);
      float leaf = rng(cell);
      float lm   = step(0.60, leaf) * smoothstep(0.08, 0.22, v) * (1.0 - smoothstep(0.48, 0.80, v));
      pc = mix(pc, c3 * 1.15, lm * 0.55);

      /* Bright tip */
      pc = mix(pc, c4, smoothstep(0.78, 1.0, v) * 0.45);

      /* Detail tint */
      pc.r += (nd - 0.5) * 0.06;
      pc.g += (nd - 0.5) * 0.03;

      float alpha = smoothstep(0.04, 0.20, v);
      float glow  = smoothstep(0.04, 0.11, v) * (1.0 - smoothstep(0.11, 0.30, v));

      vec3 col = mix(bg, pc, alpha);
      col += c1 * glow * 0.18;

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `;

  /* ── Helpers ──────────────────────────────────────────────────────────── */

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    return sh;
  }

  function program(vSrc, fSrc) {
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER,   vSrc));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fSrc));
    gl.linkProgram(prog);
    return prog;
  }

  function makeTex(w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    return tex;
  }

  function makeFbo(tex) {
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return fbo;
  }

  /* ── Programs ─────────────────────────────────────────────────────────── */

  const simProg  = program(VERT_SRC, SIM_SRC);
  const dispProg = program(VERT_SRC, DISP_SRC);

  /* Fullscreen quad */
  const quadBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

  /* Uniform locations */
  const uSim  = { S: gl.getUniformLocation(simProg,  'S'),
                  R: gl.getUniformLocation(simProg,  'R'),
                  M: gl.getUniformLocation(simProg,  'M'),
                  VL:gl.getUniformLocation(simProg,  'VL'),
                  T: gl.getUniformLocation(simProg,  'T') };
  const uDisp = { S: gl.getUniformLocation(dispProg, 'S'),
                  DR:gl.getUniformLocation(dispProg, 'DR') };

  const aSimPos  = gl.getAttribLocation(simProg,  'a');
  const aDispPos = gl.getAttribLocation(dispProg, 'a');

  /* ── Ping-pong state ──────────────────────────────────────────────────── */

  const SIM_SCALE = 0.28;
  const DPR       = Math.min(window.devicePixelRatio || 1, 1.5);
  const fixedH    = window.innerHeight;
  let   lastW     = window.innerWidth;

  let simW, simH;
  let pingTex, pongTex, pingFbo, pongFbo;

  function allocPingPong(w, h) {
    if (pingTex) { gl.deleteTexture(pingTex); gl.deleteTexture(pongTex); }
    if (pingFbo) { gl.deleteFramebuffer(pingFbo); gl.deleteFramebuffer(pongFbo); }
    pingTex = makeTex(w, h);
    pongTex = makeTex(w, h);
    pingFbo = makeFbo(pingTex);
    pongFbo = makeFbo(pongTex);
  }

  function resize() {
    const dispW = Math.round(window.innerWidth * DPR);
    const dispH = Math.round(fixedH * DPR);
    canvas.width  = dispW;
    canvas.height = dispH;
    simW = Math.max(1, Math.round(dispW * SIM_SCALE));
    simH = Math.max(1, Math.round(dispH * SIM_SCALE));
    allocPingPong(simW, simH);
  }
  resize();

  window.addEventListener('resize', () => {
    const nw = window.innerWidth;
    if (nw !== lastW) { lastW = nw; resize(); }
  }, { passive: true });

  /* ── Mouse / touch tracking ───────────────────────────────────────────── */

  let mx = 0.5, my = 0.5, mVel = 0;
  let lastMX = -1, lastMY = -1;

  function onMove(cx, cy) {
    const nx = cx / window.innerWidth;
    const ny = 1.0 - cy / fixedH;
    if (lastMX >= 0) {
      const dx = nx - lastMX, dy = ny - lastMY;
      mVel = Math.min(Math.sqrt(dx*dx + dy*dy) * 60, 1.0);
    }
    lastMX = nx; lastMY = ny;
    mx = nx; my = ny;
  }

  window.addEventListener('mousemove', e => onMove(e.clientX, e.clientY), { passive: true });
  window.addEventListener('touchmove', e => {
    const t = e.touches[0];
    onMove(t.clientX, t.clientY);
  }, { passive: true });
  window.addEventListener('touchstart', e => {
    const t = e.touches[0];
    lastMX = t.clientX / window.innerWidth;
    lastMY = 1.0 - t.clientY / fixedH;
    mx = lastMX; my = lastMY;
    mVel = 0.5;
  }, { passive: true });

  /* ── Draw helpers ─────────────────────────────────────────────────────── */

  function bindQuad(attrLoc) {
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.enableVertexAttribArray(attrLoc);
    gl.vertexAttribPointer(attrLoc, 2, gl.FLOAT, false, 0, 0);
  }

  /* ── RAF loop ─────────────────────────────────────────────────────────── */

  let t0 = null;

  function loop(ts) {
    requestAnimationFrame(loop);
    if (!t0) t0 = ts;
    const T = (ts - t0) * 0.001;

    /* ── Simulate: read ping, write pong ── */
    gl.bindFramebuffer(gl.FRAMEBUFFER, pongFbo);
    gl.viewport(0, 0, simW, simH);
    gl.useProgram(simProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, pingTex);
    gl.uniform1i(uSim.S,  0);
    gl.uniform2f(uSim.R,  simW, simH);
    gl.uniform2f(uSim.M,  mx, my);
    gl.uniform1f(uSim.VL, mVel);
    gl.uniform1f(uSim.T,  T);
    bindQuad(aSimPos);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    /* Swap ping/pong */
    let tmp;
    tmp = pingTex; pingTex = pongTex; pongTex = tmp;
    tmp = pingFbo; pingFbo = pongFbo; pongFbo = tmp;

    /* ── Display: read ping (just-written), write screen ── */
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(dispProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, pingTex);
    gl.uniform1i(uDisp.S,  0);
    gl.uniform2f(uDisp.DR, canvas.width, canvas.height);
    bindQuad(aDispPos);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    /* Decay velocity each frame */
    mVel *= 0.85;
  }

  requestAnimationFrame(loop);

}());
