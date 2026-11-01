# After Nishitsuji

*A transcription, not an original work.* A one-line twigl shader by Yohei Nishitsuji
([x.com/yoheinishitsuji/status/1999814369925046474](https://x.com/yoheinishitsuji/status/1999814369925046474)),
expanded into readable GLSL ES 3.00 and run as a standalone WebGL2 page. At the default settings
the output matches the original: a cloud deck seen from above, drifting under a slowly swaying
camera.

## Original (verbatim)

```glsl
for(float i,g,e,s;++i<99.;o.rgb+=.01-hsv(.1,g*.016-e*.3,s/2e2)){vec3 p=vec3((FC.xy-.5*r)/r.y*5.+vec2(0,9),g)*rotate3D(-1.1-cos(t*.15)*.1,vec3(1,11.+sin(t)*.15,-1.5));s=2.;for(int i;i++<19;p=vec3(.08,4,-1)-abs(abs(p)*e-vec3(3,4,3)))s*=e=7.1/dot(p,p*.51);g+=p.y/s;s=log2(s)/exp(e);}
```

## How it works

| Stage | Code | Role |
|---|---|---|
| Ray | `vec3((FC-.5r)/r.y*5 + (0,9), g) * rotate3D(...)` | Screen point lifted 9 units, pushed to depth `g`, rotated by a camera whose angle and axis sway with `t` |
| Fractal | 19 × `e = 7.1/dot(p,p*.51); s *= e; p = (.08,4,-1) - abs(abs(p)*e - (3,4,3))` | Kaleidoscopic IFS: spherical inversion, then double fold and offset. `s` carries the running scale |
| March | `g += p.y / s` | Distance estimate: step forward by the folded height divided by the accumulated scale |
| Light | `s = log2(s)/exp(e)`; `o.rgb += .01 - hsv(.1, g*.016 - e*.3, s/200)` | Each of 98 samples adds a small constant brightness, minus an orange tint whose complement reads as blue sky; dense regions subtract more, leaving white cloud |

Twigl's implicit inputs are made explicit: `FC` = `gl_FragCoord`, `r` = resolution, `t` = seconds,
`o` = output; `hsv()` and `rotate3D()` are reproduced from twigl's "geekest" preamble. Uninitialised
floats are set to 0, as twigl relies on in practice.

## Controls

Panel: march steps, fold count, inversion scale, zoom, hue, speed, render resolution,
**reset to original**, save PNG. Keys: F fullscreen, H hide, space pause, S save PNG.
`?t=<seconds>` freezes the clock at a fixed time (used for `preview.png`, `t=3`).

## Rights

The shader and its image belong to Yohei Nishitsuji. This folder is a study for learning; it is
not offered as part of the collection's own work and must not be sold, minted or exhibited as such.
