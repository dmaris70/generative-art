// Abstract 15 — static trace
//
// The COLLADA file is used only as geometry data. The drawing keeps its saved
// SketchUp camera and the 48 original instance transforms. The original triangle
// meshes are depth-sorted and shaded; their edges remain visible beneath the
// explicit centre traces, which are made with p5.brush's HB pencil.

let scene;

function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
  pixelDensity(Math.min(2, window.devicePixelRatio || 1));
  scene = readScene(window.DAE_SOURCE);
  randomSeed(15);
  noiseSeed(15);
  noLoop();
}

function draw() {
  background(255);
  if (!scene) return;

  // The DAE does not store a usable aspect ratio (SketchUp exports zero), so a
  // square camera gate preserves its geometry without stretching on any screen.
  const gate = Math.min(width, height);
  const focal = 1 / Math.tan(radians(scene.yfov) * 0.5);

  drawMesh(gate, focal);

  // Preserve the original construction traces as dry graphite over the solid
  // geometry. Seeding in setup keeps their grain static and reproducible.
  brush.scaleBrushes(Math.max(0.8, gate / 900));
  brush.noFill();
  brush.set('HB', '#11100f', 0.72);
  for (const path of scene.paths) {
    brush.beginShape(0);
    for (const worldPoint of path) {
      const p = projectPoint(worldPoint, gate, focal);
      if (p) brush.vertex(p.x, p.y, 0.68);
    }
    brush.endShape(false);
  }
}

function drawMesh(gate, focal) {
  const faces = [];
  const light = normalize3([-0.48, -0.62, 0.62]);

  for (const surface of scene.surfaces) {
    const projected = surface.points.map((point) => projectPoint(point, gate, focal));
    for (const triangle of surface.triangles) {
      const a = projected[triangle[0]];
      const b = projected[triangle[1]];
      const c = projected[triangle[2]];
      if (!a || !b || !c) continue;

      let normal = normalize3(cross3(sub3(b.view, a.view), sub3(c.view, a.view)));
      const centre = [
        (a.view[0] + b.view[0] + c.view[0]) / 3,
        (a.view[1] + b.view[1] + c.view[1]) / 3,
        (a.view[2] + b.view[2] + c.view[2]) / 3,
      ];

      // Treat the closed SketchUp surfaces as two-sided; mirrored instances in
      // the source reverse their winding, but should receive the same lighting.
      if (dot3(normal, [-centre[0], -centre[1], -centre[2]]) < 0) {
        normal = [-normal[0], -normal[1], -normal[2]];
      }

      const diffuse = Math.max(0, dot3(normal, light));
      const shade = Math.round(142 + diffuse * 104);
      const depth = -(a.view[2] + b.view[2] + c.view[2]) / 3;
      faces.push({ a, b, c, shade, depth });
    }
  }

  // Painter's order supplies occlusion while retaining the exact saved camera.
  faces.sort((a, b) => b.depth - a.depth);
  stroke(30, 54);
  strokeWeight(Math.max(0.22, gate / 4200));
  beginShape(TRIANGLES);
  for (const face of faces) {
    fill(face.shade, face.shade, face.shade + 2, 255);
    vertex(face.a.x, face.a.y);
    vertex(face.b.x, face.b.y);
    vertex(face.c.x, face.c.y);
  }
  endShape();
}

function projectPoint(worldPoint, gate, focal) {
  const view = transformPoint(scene.view, worldPoint);
  const depth = -view[2];
  if (depth <= 0) return null;
  return {
    x: (view[0] / depth) * focal * gate * 0.5,
    y: -(view[1] / depth) * focal * gate * 0.5,
    view,
  };
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  redraw();
}

function keyPressed() {
  if (key === 's' || key === 'S') saveCanvas('abstract-15-trace', 'png');
}

function readScene(source) {
  const xml = new DOMParser().parseFromString(source, 'application/xml');
  if (xml.querySelector('parsererror')) throw new Error('Could not parse COLLADA source.');

  const byId = (id) => Array.from(xml.querySelectorAll('[id]'))
    .find((el) => el.getAttribute('id') === id);
  const numbers = (el) => el.textContent.trim().split(/\s+/).map(Number);
  const matrixOf = (node) => numbers(directChild(node, 'matrix'));

  const cameraNode = Array.from(xml.getElementsByTagName('node'))
    .find((node) => node.getAttribute('name') === 'skp_camera_Last_Saved_SketchUp_View');
  const camera = matrixOf(cameraNode);
  const view = inverseRigid(camera);

  const cameraRef = directChild(cameraNode, 'instance_camera').getAttribute('url').slice(1);
  const cameraDef = byId(cameraRef);
  const yfov = Number(cameraDef.getElementsByTagName('yfov')[0].textContent);

  const visualScene = xml.getElementsByTagName('visual_scene')[0];
  const group = Array.from(visualScene.getElementsByTagName('node'))
    .find((node) => directChildren(node, 'node')
      .some((child) => directChildren(child, 'instance_node').length > 0));
  const groupMatrix = matrixOf(group);

  // Resolve both geometries attached to each reusable library node: the closed
  // triangle surface and its explicit construction line.
  const modelsByLibraryNode = new Map();
  const libraryNodes = xml.getElementsByTagName('library_nodes')[0];
  for (const libraryNode of directChildren(libraryNodes, 'node')) {
    const modelData = { trace: null, points: null, triangles: null };
    for (const instanceGeometry of directChildren(libraryNode, 'instance_geometry')) {
      const geometry = byId(instanceGeometry.getAttribute('url').slice(1));
      const lines = geometry.getElementsByTagName('lines')[0];
      const sourceRef = geometry.getElementsByTagName('vertices')[0]
        .getElementsByTagName('input')[0].getAttribute('source').slice(1);
      const floats = numbers(byId(sourceRef).getElementsByTagName('float_array')[0]);
      const points = [];
      for (let i = 0; i < floats.length; i += 3) points.push([floats[i], floats[i + 1], floats[i + 2], 1]);

      if (lines) {
        const order = numbers(lines.getElementsByTagName('p')[0]);
        const adjacency = new Map();
        for (let i = 0; i < order.length; i += 2) {
          connect(adjacency, order[i], order[i + 1]);
          connect(adjacency, order[i + 1], order[i]);
        }

        // Reconstruct the single exported polyline from its unordered line pairs.
        const start = Array.from(adjacency.keys()).find((index) => adjacency.get(index).length === 1);
        const path = [];
        let previous = -1;
        let current = start;
        while (current !== undefined) {
          path.push(points[current]);
          const next = adjacency.get(current).find((index) => index !== previous);
          previous = current;
          current = next;
        }
        modelData.trace = path;
      } else {
        const triangleNode = geometry.getElementsByTagName('triangles')[0];
        if (!triangleNode) continue;
        const indices = numbers(triangleNode.getElementsByTagName('p')[0]);
        const triangles = [];
        for (let i = 0; i < indices.length; i += 3) {
          triangles.push([indices[i], indices[i + 1], indices[i + 2]]);
        }
        modelData.points = points;
        modelData.triangles = triangles;
      }
    }
    modelsByLibraryNode.set(libraryNode.getAttribute('id'), modelData);
  }

  const paths = [];
  const surfaces = [];
  for (const instanceNode of directChildren(group, 'node')) {
    const reference = directChild(instanceNode, 'instance_node').getAttribute('url').slice(1);
    const local = modelsByLibraryNode.get(reference);
    const model = multiply4(groupMatrix, matrixOf(instanceNode));
    paths.push(local.trace.map((point) => transformPoint(model, point)));
    surfaces.push({
      points: local.points.map((point) => transformPoint(model, point)),
      triangles: local.triangles,
    });
  }

  return { view, yfov, paths, surfaces };
}

function directChildren(parent, tagName) {
  return Array.from(parent.children).filter((child) => child.localName === tagName);
}

function directChild(parent, tagName) {
  return directChildren(parent, tagName)[0];
}

function connect(adjacency, from, to) {
  if (!adjacency.has(from)) adjacency.set(from, []);
  adjacency.get(from).push(to);
}

function sub3(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross3(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalize3(v) {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

// Row-major 4 × 4 matrix multiplication, matching SketchUp's DAE export.
function multiply4(a, b) {
  const out = new Array(16).fill(0);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      for (let k = 0; k < 4; k++) out[row * 4 + col] += a[row * 4 + k] * b[k * 4 + col];
    }
  }
  return out;
}

function transformPoint(matrix, point) {
  return [
    matrix[0] * point[0] + matrix[1] * point[1] + matrix[2] * point[2] + matrix[3] * point[3],
    matrix[4] * point[0] + matrix[5] * point[1] + matrix[6] * point[2] + matrix[7] * point[3],
    matrix[8] * point[0] + matrix[9] * point[1] + matrix[10] * point[2] + matrix[11] * point[3],
    matrix[12] * point[0] + matrix[13] * point[1] + matrix[14] * point[2] + matrix[15] * point[3],
  ];
}

// Camera transforms are rigid, so inverse(C) = [R^T | -R^T t].
function inverseRigid(m) {
  const r00 = m[0], r01 = m[1], r02 = m[2];
  const r10 = m[4], r11 = m[5], r12 = m[6];
  const r20 = m[8], r21 = m[9], r22 = m[10];
  const tx = m[3], ty = m[7], tz = m[11];

  return [
    r00, r10, r20, -(r00 * tx + r10 * ty + r20 * tz),
    r01, r11, r21, -(r01 * tx + r11 * ty + r21 * tz),
    r02, r12, r22, -(r02 * tx + r12 * ty + r22 * tz),
    0, 0, 0, 1,
  ];
}
