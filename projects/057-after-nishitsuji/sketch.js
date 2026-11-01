// After Nishitsuji — a faithful transcription of a twigl "geekest" one-liner by Yohei Nishitsuji
// (x.com/yoheinishitsuji/status/1999814369925046474), expanded into readable GLSL ES 3.00.
//
// The original, verbatim:
//   for(float i,g,e,s;++i<99.;o.rgb+=.01-hsv(.1,g*.016-e*.3,s/2e2)){vec3 p=vec3((FC.xy-.5*r)/r.y*5.
//   +vec2(0,9),g)*rotate3D(-1.1-cos(t*.15)*.1,vec3(1,11.+sin(t)*.15,-1.5));s=2.;for(int i;i++<19;
//   p=vec3(.08,4,-1)-abs(abs(p)*e-vec3(3,4,3)))s*=e=7.1/dot(p,p*.51);g+=p.y/s;s=log2(s)/exp(e);}
//
// twigl provides FC (gl_FragCoord), r (resolution), t (seconds), o (output) and the helpers
// hsv() and rotate3D(), reproduced below. Defaults reproduce the original exactly; the panel
// exposes its constants for study.

(function () {
  'use strict';
  const err = m => { const el = document.getElementById('error'); el.textContent = '⚠ ' + m; el.hidden = false; };
  addEventListener('error', e => err(e.message));

  const q = new URLSearchParams(location.search);
  const P = {
    steps: 99,          // outer march limit (original: ++i<99. → 98 samples)
    folds: 19,          // inner fold iterations
    scale: 7.1,         // inversion numerator: e = scale / dot(p, p*.51)
    zoom: 5,            // screen-space zoom
    hue: 0.1,           // hsv hue
    speed: 1,
    resolution: Math.min(devicePixelRatio || 1, 2),
    time: q.has('t') ? +q.get('t') : null,
  };

  const canvas = document.getElementById('c');
  const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
  if (!gl) { err('WebGL2 not available'); return; }

  const VS = `#version 300 es
in vec2 a; void main(){ gl_Position = vec4(a, 0., 1.); }`;

  const FS = `#version 300 es
precision highp float;
uniform vec2 r; uniform float t;
uniform int uSteps, uFolds; uniform float uScale, uZoom, uHue;
out vec4 o;

// twigl helpers
vec3 hsv(float h, float s, float v){
  vec4 k = vec4(1., 2./3., 1./3., 3.);
  vec3 p = abs(fract(vec3(h) + k.xyz) * 6. - vec3(k.w));
  return v * mix(vec3(k.x), clamp(p - vec3(k.x), 0., 1.), s);
}
mat3 rotate3D(float angle, vec3 axis){
  vec3 a = normalize(axis);
  float s = sin(angle), c = cos(angle), r = 1. - c;
  return mat3(
    a.x*a.x*r + c,     a.y*a.x*r + a.z*s, a.z*a.x*r - a.y*s,
    a.x*a.y*r - a.z*s, a.y*a.y*r + c,     a.z*a.y*r + a.x*s,
    a.x*a.z*r + a.y*s, a.y*a.z*r - a.x*s, a.z*a.z*r + c);
}

void main(){
  vec2 FC = gl_FragCoord.xy;
  o = vec4(0., 0., 0., 1.);
  float g = 0., e = 0., s = 0.;
  // camera: slow sway of the rotation angle and axis
  mat3 R = rotate3D(-1.1 - cos(t*.15)*.1, vec3(1., 11. + sin(t)*.15, -1.5));
  for (int i = 1; i < 1000; i++) {
    if (i >= uSteps) break;
    // ray position: screen plane offset upward by 9, depth = accumulated distance g
    vec3 p = vec3((FC - .5*r) / r.y * uZoom + vec2(0., 9.), g) * R;
    s = 2.;
    // KIFS: fold, scale and spherical inversion; s tracks the running derivative
    for (int j = 0; j < 100; j++) {
      if (j >= uFolds) break;
      e = uScale / dot(p, p*.51);
      s *= e;
      p = vec3(.08, 4., -1.) - abs(abs(p)*e - vec3(3., 4., 3.));
    }
    g += p.y / s;                 // step by the estimated distance
    s = log2(s) / exp(e);         // density term → brightness
    // additive light with a subtractive tint: saturation rises with depth, value with density
    o.rgb += .01 - hsv(uHue, g*.016 - e*.3, s/2e2);
  }
}`;

  function compile(type, src) {
    const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = n => gl.getUniformLocation(prog, n);
  const u = { r: U('r'), t: U('t'), steps: U('uSteps'), folds: U('uFolds'), scale: U('uScale'), zoom: U('uZoom'), hue: U('uHue') };

  function resize() {
    const w = Math.round(innerWidth * P.resolution), h = Math.round(innerHeight * P.resolution);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }

  let paused = P.time !== null, clock = P.time ?? 0, last = performance.now();
  function draw(now) {
    const dt = (now - last) / 1000; last = now;
    if (!paused) clock += dt * P.speed;
    resize();
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(u.r, canvas.width, canvas.height);
    gl.uniform1f(u.t, clock);
    gl.uniform1i(u.steps, P.steps);
    gl.uniform1i(u.folds, P.folds);
    gl.uniform1f(u.scale, P.scale);
    gl.uniform1f(u.zoom, P.zoom);
    gl.uniform1f(u.hue, P.hue);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);

  function save() {
    const a = document.createElement('a');
    a.download = `after-nishitsuji-t${clock.toFixed(2)}.png`;
    a.href = canvas.toDataURL('image/png'); a.click();
  }

  if (window.lil) {
    const gui = new lil.GUI({ title: 'After Nishitsuji' });
    gui.add(P, 'steps', 10, 300, 1);
    gui.add(P, 'folds', 4, 30, 1);
    gui.add(P, 'scale', 5, 9, 0.01);
    gui.add(P, 'zoom', 1, 12, 0.1);
    gui.add(P, 'hue', 0, 1, 0.005);
    gui.add(P, 'speed', 0, 3, 0.01);
    gui.add(P, 'resolution', 0.25, 2, 0.05);
    gui.add({ reset() { Object.assign(P, { steps: 99, folds: 19, scale: 7.1, zoom: 5, hue: 0.1, speed: 1 }); gui.controllersRecursive().forEach(c => c.updateDisplay()); } }, 'reset').name('reset to original');
    gui.add({ save }, 'save').name('save PNG');
    if (innerWidth < 640) gui.close();
  }

  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (k === ' ') { paused = !paused; e.preventDefault(); }
    else if (k === 'f') { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); }
    else if (k === 'h') document.body.classList.toggle('bare');
    else if (k === 's') save();
  });
  setTimeout(() => document.getElementById('hint').style.opacity = '0', 6000);
})();
