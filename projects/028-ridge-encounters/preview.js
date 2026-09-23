/*
 * preview.js — the live view: the same land, raymarched on the GPU so you can turn your head and walk.
 * It is a SKETCH of what the painter will make (no brush, no grain, a simpler cloud) and is never the work itself:
 * "Paint from here" hands the standpoint to the CPU engine, which stays the canonical, bit-reproducible render.
 *   const view = LiveView.open(canvas, { n, H, lum, cam });  view.cam  → { x, z, eye, yaw, pitch, roll, focal }
 * Drag = look · W/S or ↑/↓ = walk · A/D = sidestep · wheel = eye height · Q/E = tilt
 */
(function (global) {
  'use strict';
  const VS = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }`;
  const FS = `#version 300 es
precision highp float; precision highp sampler2D;
uniform sampler2D uH, uL; uniform float uN, uYaw, uPitch, uRoll, uFocal, uEye, uFog; uniform vec2 uRes, uPos; out vec4 o;
float mir(float v){ float m = 2.*(uN-1.); v = mod(abs(v), m); return v > uN-1. ? m - v : v; }
float tex(sampler2D s, vec2 q){ q = vec2(mir(q.x), mir(q.y)); vec2 i = floor(q), f = q - i; ivec2 a = ivec2(i), b = min(a + 1, ivec2(int(uN) - 1));
  float h00 = texelFetch(s, a, 0).r, h10 = texelFetch(s, ivec2(b.x, a.y), 0).r, h01 = texelFetch(s, ivec2(a.x, b.y), 0).r, h11 = texelFetch(s, b, 0).r;
  return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y); }
float hash(vec2 q){ return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 q){ vec2 i = floor(q), f = q - i; f = f*f*(3.-2.*f); return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
void main(){
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uRes * vec2(900., 597.) - vec2(450., 298.5);
  float cr = cos(uRoll), sr = sin(uRoll); px = vec2(px.x*cr - px.y*sr, px.x*sr + px.y*cr);
  float kx = px.x / uFocal, ky = -px.y / uFocal + tan(uPitch);
  vec2 fw = vec2(cos(uYaw), sin(uYaw)), rt = vec2(-fw.y, fw.x), d2 = fw + rt * kx;
  float camY = tex(uH, uPos) + uEye, t = 1.2, hit = 0., pt = 1.2;
  for (int i = 0; i < 420; i++) { vec2 q = uPos + d2 * t; if (camY + ky * t < tex(uH, q)) { hit = 1.; break; } pt = t; t += max(.5, t * .012); if (t > 1500.) break; }
  if (hit > .5) for (int i = 0; i < 6; i++) { float m = .5 * (pt + t); if (camY + ky * m < tex(uH, uPos + d2 * m)) t = m; else pt = m; }
  float cloud = 203. + (vn(px * .01) - .5) * 14., tone = cloud;
  if (hit > .5) { vec2 q = uPos + d2 * t; float l = .4 + (tex(uL, q) - .4) * 1.3; l = clamp(l, 0., 1.); l = l*l*(3.-2.*l)*.55 + l*.45;
    float y = camY + ky * t, band = exp(-pow((y - (camY - 20.)) / 45., 2.)) * vn(q * .006) * 2.2;
    tone = mix(cloud, 34. + 190. * l, exp(-t * .0009 - uFog * band * t * .004)); }
  float cut = step(abs(gl_FragCoord.x - uRes.x * .5), 1.);
  o = vec4(vec3(mix(tone, 11., cut) / 255.), 1.);
}`;
  function open(canvas, g) {
    const gl = canvas.getContext('webgl2', { antialias: false }); if (!gl) return null;
    const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
    const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); gl.useProgram(pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.bindAttribLocation(pr, 0, 'p'); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const up = (unit, data) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, g.n, g.n, 0, gl.RED, gl.FLOAT, data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); };
    up(0, g.H); up(1, g.lum);
    const U = n => gl.getUniformLocation(pr, n), cam = Object.assign({}, g.cam), view = { cam, fog: 1, close };
    let raf = 0, dirty = true; const keys = new Set();
    function frame() {
      raf = requestAnimationFrame(frame);
      const sp = keys.has('shift') ? 4 : 1.2, f = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0), r = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0), q = (keys.has('e') ? 1 : 0) - (keys.has('q') ? 1 : 0);
      if (f || r || q) { cam.x += (Math.cos(cam.yaw) * f - Math.sin(cam.yaw) * r) * sp; cam.z += (Math.sin(cam.yaw) * f + Math.cos(cam.yaw) * r) * sp; cam.roll += q * 0.01; dirty = true; }
      if (!dirty) return; dirty = false;
      const w = canvas.clientWidth * Math.min(2, devicePixelRatio || 1) | 0, h = canvas.clientHeight * Math.min(2, devicePixelRatio || 1) | 0; if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h); gl.uniform1i(U('uH'), 0); gl.uniform1i(U('uL'), 1); gl.uniform1f(U('uN'), g.n); gl.uniform2f(U('uRes'), w, h); gl.uniform2f(U('uPos'), cam.x, cam.z);
      gl.uniform1f(U('uYaw'), cam.yaw); gl.uniform1f(U('uPitch'), cam.pitch); gl.uniform1f(U('uRoll'), cam.roll); gl.uniform1f(U('uFocal'), cam.focal); gl.uniform1f(U('uEye'), cam.eye); gl.uniform1f(U('uFog'), view.fog);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); if (view.onchange) view.onchange(cam);
    }
    let drag = null;
    const down = e => { drag = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); }, upE = () => { drag = null; };
    const move = e => { if (!drag) return; cam.yaw -= (e.clientX - drag[0]) / cam.focal * 1.4; cam.pitch = Math.max(-0.9, Math.min(0.9, cam.pitch + (e.clientY - drag[1]) / cam.focal * 1.4)); drag = [e.clientX, e.clientY]; dirty = true; };
    const wheel = e => { e.preventDefault(); cam.eye = Math.max(0.6, Math.min(80, cam.eye * (e.deltaY > 0 ? 1.08 : 0.93))); dirty = true; };
    const kd = e => { if (e.target.tagName === 'INPUT') return; const k = e.key.toLowerCase(); if ('wasdqe'.includes(k) || k.startsWith('arrow') || k === 'shift') { keys.add(k); e.preventDefault(); e.stopPropagation(); } }, ku = e => keys.delete(e.key.toLowerCase());
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointerup', upE); canvas.addEventListener('pointermove', move); canvas.addEventListener('wheel', wheel, { passive: false });
    addEventListener('keydown', kd, true); addEventListener('keyup', ku, true);
    function close() { cancelAnimationFrame(raf); removeEventListener('keydown', kd, true); removeEventListener('keyup', ku, true); canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointerup', upE); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('wheel', wheel); const x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); }
    view.redraw = () => { dirty = true; }; frame(); return view;
  }
  global.LiveView = { open };
})(window);
