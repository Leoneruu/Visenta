/* Metallic silver WebGL shader – ambient animation only, no mouse effect */
(function initShaderBg() {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  if (!gl) { canvas.parentElement.style.background = '#101012'; return; }

  const VS = `
    attribute vec2 a_pos;
    void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
  `;

  const FS = `
    precision mediump float;
    uniform float u_t;
    uniform vec2  u_res;

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
      vec2 uv = gl_FragCoord.xy / u_res;
      uv.x   *= u_res.x / u_res.y;

      float t = u_t * 0.045;
      vec2  p = uv;

      vec2 q = vec2(
        fbm(p*1.8 + vec2(0.00,0.00) + t*0.38),
        fbm(p*1.8 + vec2(5.20,1.30) + t*0.38));
      vec2 r = vec2(
        fbm(p*1.4 + 2.8*q + vec2(1.70,9.20) + t*0.22),
        fbm(p*1.4 + 2.8*q + vec2(8.30,2.80) + t*0.28));

      float hills  = fbm( p*1.2 + 2.5*r + t*0.10);
      float ridges = rfbm(p*2.2 + r*1.8 + t*0.07);
      float h      = hills*0.68 + ridges*0.32;

      vec2  qN     = q - 0.5;
      vec2  qDir   = normalize(qN + vec2(0.001));
      vec2  sunDir = normalize(vec2(0.55, 0.82));
      float diffuse  = dot(qDir, sunDir);
      float specular = pow(pow(max(0.0,diffuse), 6.0), 3.0) * 1.8;
      float rim      = 1.0 - clamp(dot(qDir, vec2(0.0,1.0)), 0.0, 1.0);
      float shade    = 0.30 + 0.70 * clamp(diffuse*0.5+0.5, 0.0, 1.0);

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

      float ct = fract(h*10.0);
      col *= 1.0-(1.0-smoothstep(0.0,0.04,abs(ct-0.5)-0.47))*0.06;

      vec2  vUV = gl_FragCoord.xy / u_res - 0.5;
      float vig = 1.0 - smoothstep(0.28,1.10,length(vUV));
      col *= mix(0.03, 1.0, vig);
      col *= 0.80;

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('Shader:', gl.getShaderInfoLog(s)); return null;
    }
    return s;
  }

  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER,   VS));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER,
    new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uT   = gl.getUniformLocation(prog, 'u_t');
  const uRes = gl.getUniformLocation(prog, 'u_res');
  const DPR  = Math.min(window.devicePixelRatio || 1, 1.5);

  function resize() {
    canvas.width  = Math.round(window.innerWidth  * DPR);
    canvas.height = Math.round(window.innerHeight * DPR);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uRes, canvas.width, canvas.height);
  }
  resize();
  window.addEventListener('resize', resize);

  function tick(ts) {
    gl.uniform1f(uT, ts * 0.001);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}());
