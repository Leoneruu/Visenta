(function () {
  'use strict';

  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;

  const gl = canvas.getContext('webgl', {
    alpha: false, antialias: false, depth: false, stencil: false
  });
  if (!gl) return;

  /* ── Vertex shader (fullscreen triangle pair) ─────────────────────────── */
  const VERT = `
    attribute vec2 aPos;
    void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
  `;

  /* ── Fragment shader ──────────────────────────────────────────────────── */
  const FRAG = `
    precision highp float;
    uniform float uTime;
    uniform vec2  uRes;

    /* ── Palette ──────────────────────────────────────────────────────────
       #4776E6  #C44DFF  #1a6bbc  #F8BBD9  #FF8C42                        */
    const vec3 C1 = vec3(0.2784, 0.4627, 0.9020);
    const vec3 C2 = vec3(0.7686, 0.3020, 1.0000);
    const vec3 C3 = vec3(0.1020, 0.4196, 0.7373);
    const vec3 C4 = vec3(0.9725, 0.7333, 0.8510);
    const vec3 C5 = vec3(1.0000, 0.5490, 0.2588);

    /* ── Knobs ────────────────────────────────────────────────────────── */
    const float WAVE_STR    = 0.25;
    const float WAVE_FREQ   = 1.6;
    const float WAVE_ANG    = 78.0;   /* degrees                          */
    const float LIQ_INT     = 10.0;
    const float LIQ_STIFF   = 15.0;
    const float GRAIN_AMT   = 0.4;
    const float COLOR_BLEND = 2.0;
    const float PI          = 3.14159265358979;

    /* ── Value noise ──────────────────────────────────────────────────── */
    float hash(vec2 p) {
      p = fract(p * vec2(127.1, 311.7));
      p += dot(p, p + 19.19);
      return fract(p.x * p.y);
    }

    float vnoise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i),              hash(i + vec2(1.0, 0.0)), f.x),
        mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), f.x),
        f.y
      );
    }

    /* 4-octave fBm ── fast enough for mobile ────────────────────────── */
    float fbm(vec2 p) {
      float v = 0.0, a = 0.5;
      for (int i = 0; i < 4; i++) {
        v += a * vnoise(p);
        p  = p * 2.1 + vec2(1.7, 9.2);
        a *= 0.5;
      }
      return v;
    }

    void main() {
      vec2  uv = gl_FragCoord.xy / uRes;
      float T  = uTime * 0.11;          /* slow overall drift              */

      /* ── Wave distortion ─────────────────────────────────────────────
         Angle 78°, frequency 1.6, strength 0.25
         Displaces UVs perpendicular to the wave direction.             */
      float wAng = WAVE_ANG * PI / 180.0;
      vec2  wDir = vec2(cos(wAng), sin(wAng));
      float wv   = sin(dot(uv, wDir) * WAVE_FREQ * 2.0 * PI + T * 1.6)
                   * WAVE_STR * 0.11;
      vec2  wuv  = uv + wv * vec2(-wDir.y, wDir.x);

      /* ── Liquify (fBm displacement) ──────────────────────────────────
         Intensity 10 / Stiffness 15 → ratio ≈ 0.667
         Stiffness maps to noise frequency; intensity drives amplitude. */
      float liqFreq = LIQ_STIFF * 0.13;
      float liqAmt  = (LIQ_INT / LIQ_STIFF) * 0.06;
      vec2  liq = vec2(
        fbm(wuv * liqFreq + vec2(T * 0.38, T * 0.22)),
        fbm(wuv * liqFreq + vec2(T * 0.22, T * 0.38) + 4.73)
      ) * 2.0 - 1.0;
      vec2 fuv = wuv + liq * liqAmt;

      /* ── 5 colour blobs, each orbiting at its own radius + phase ─────
         COLOR_BLEND = 2.0 controls falloff sharpness (higher = tighter
         blobs, sharper colour transitions).                            */
      vec2 q1 = vec2(0.50 + 0.40*sin(T*0.68),         0.50 + 0.30*cos(T*0.52));
      vec2 q2 = vec2(0.50 + 0.32*cos(T*0.54 + 1.10),  0.50 + 0.38*sin(T*0.76 + 2.00));
      vec2 q3 = vec2(0.50 + 0.28*sin(T*0.83 + 3.00),  0.50 + 0.36*cos(T*0.59 + 1.50));
      vec2 q4 = vec2(0.50 + 0.44*cos(T*0.48 + 2.50),  0.50 + 0.26*sin(T*0.67 + 0.50));
      vec2 q5 = vec2(0.50 + 0.26*sin(T*0.77 + 1.50),  0.50 + 0.44*cos(T*0.86 + 3.50));

      /* Slightly varied falloff per blob for organic feel */
      float k  = COLOR_BLEND * 4.2;
      float w1 = exp(-distance(fuv, q1) * k * 0.90);
      float w2 = exp(-distance(fuv, q2) * k * 1.05);
      float w3 = exp(-distance(fuv, q3) * k * 0.85);
      float w4 = exp(-distance(fuv, q4) * k * 1.10);
      float w5 = exp(-distance(fuv, q5) * k * 0.95);
      float wT = w1 + w2 + w3 + w4 + w5 + 1e-5;

      vec3 col = (C1*w1 + C2*w2 + C3*w3 + C4*w4 + C5*w5) / wT;

      /* ── Film grain ──────────────────────────────────────────────────
         GRAIN_AMT 0.4 → ~4 % noise amplitude after 0.1 scale factor.  */
      float grain = hash(gl_FragCoord.xy + fract(T * 173.4)) * 2.0 - 1.0;
      col += grain * GRAIN_AMT * 0.04;

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `;

  /* ── Compile & link ───────────────────────────────────────────────────── */
  function compileShader(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    return sh;
  }

  const prog = gl.createProgram();
  gl.attachShader(prog, compileShader(gl.VERTEX_SHADER,   VERT));
  gl.attachShader(prog, compileShader(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  gl.useProgram(prog);

  /* ── Fullscreen quad (2 triangles) ───────────────────────────────────── */
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,   1, -1,   -1, 1,
     1, -1,   1,  1,   -1, 1
  ]), gl.STATIC_DRAW);

  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uTime = gl.getUniformLocation(prog, 'uTime');
  const uRes  = gl.getUniformLocation(prog, 'uRes');

  /* ── Canvas sizing (width-only resize) ───────────────────────────────── */
  const DPR    = Math.min(window.devicePixelRatio || 1, 1.5);
  const fixedH = window.innerHeight;
  let   lastW  = window.innerWidth;

  function resize() {
    const w = Math.round(window.innerWidth * DPR);
    const h = Math.round(fixedH * DPR);
    canvas.width  = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
  }
  resize();

  window.addEventListener('resize', function () {
    const nw = window.innerWidth;
    if (nw !== lastW) { lastW = nw; resize(); }
  }, { passive: true });

  /* ── RAF loop ─────────────────────────────────────────────────────────── */
  let t0 = null;
  function loop(ts) {
    requestAnimationFrame(loop);
    if (!t0) t0 = ts;
    gl.uniform1f(uTime, (ts - t0) * 0.001);
    gl.uniform2f(uRes,  canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  requestAnimationFrame(loop);

}());
