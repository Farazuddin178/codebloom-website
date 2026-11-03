// Knowledge network: a scroll-driven flight through glowing nodes, links, data pulses and code glyphs.
import * as THREE from 'three';

const Z_START = 30;
const TRAVEL = 440;                         // distance flown over a full page scroll
const FIELD_NEAR = 70, FIELD_FAR = -760;    // z-range the network fills
const FLOOR_Y = -24;

const COLORS = ['#5ee7ff', '#7f9cff', '#b58cff', '#f7b8c9', '#ffd166'].map((c) => new THREE.Color(c));
const GLYPHS = ['</>', '{ }', '( )', '=>', '01', '[ ]', 'if', 'AI', 'fn', '++', '#', '&&'];

// Shared by every layer so links stay attached to the drifting nodes
const COMMON_GLSL = /* glsl */`
  uniform float uTime;
  vec3 drift(vec3 p, vec3 s) {
    return p + vec3(sin(uTime * 0.31 + s.x * 6.2832) * 1.6,
                    sin(uTime * 0.27 + s.y * 6.2832) * 1.2,
                    sin(uTime * 0.23 + s.z * 6.2832) * 1.6);
  }
  float depthFade(float d) { return smoothstep(240.0, 40.0, d) * smoothstep(2.0, 12.0, d); }
`;

function random(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function detectQuality() {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 600;
  const cores = navigator.hardwareConcurrency || 4;
  const high = !coarse && !small && cores >= 4;
  return {
    high,
    nodes: high ? 600 : 300,
    linkDistance: high ? 34 : 42,
    pulses: high ? 110 : 50,
    glyphs: high ? 60 : 30,
    maxPixelRatio: high ? 1.5 : 1.25
  };
}

// Points spread in a wide tube around the flight path, leaving the middle clear for the text
function placeInTube(rand, inner, spread) {
  const angle = rand() * Math.PI * 2;
  const r = inner + Math.pow(rand(), 0.7) * spread;
  return new THREE.Vector3(
    Math.cos(angle) * r * 1.35,
    Math.max(4 + Math.sin(angle) * r * 0.55, FLOOR_Y + 6 + rand() * 6),
    FIELD_NEAR + (FIELD_FAR - FIELD_NEAR) * rand()
  );
}

// Colour drifts from cyan to gold the further into the network you go
function colorAt(z, rand) {
  const t = THREE.MathUtils.clamp((FIELD_NEAR - z) / (FIELD_NEAR - FIELD_FAR), 0, 1);
  const i = Math.min(COLORS.length - 1, Math.floor((t * 0.8 + rand() * 0.45) * (COLORS.length - 1)));
  return COLORS[i];
}

function linkNodes(nodes, maxDist, maxLinks) {
  const order = nodes.map((_, i) => i).sort((a, b) => nodes[a].z - nodes[b].z);
  const degree = new Uint8Array(nodes.length);
  const edges = [];
  for (let oi = 0; oi < order.length; oi++) {
    const i = order[oi];
    const near = [];
    for (let oj = oi + 1; oj < order.length; oj++) {
      const j = order[oj];
      if (nodes[j].z - nodes[i].z > maxDist) break;
      const d = nodes[i].distanceTo(nodes[j]);
      if (d < maxDist) near.push([d, j]);
    }
    near.sort((a, b) => a[0] - b[0]);
    for (const [, j] of near) {
      if (degree[i] >= maxLinks) break;
      if (degree[j] >= maxLinks) continue;
      edges.push([i, j]);
      degree[i]++;
      degree[j]++;
    }
  }
  return edges;
}

function additive(uniforms, vertexShader, fragmentShader) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
}

function createSky() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color('#060918') },
      uHorizon: { value: new THREE.Color('#1a1446') },
      uBottom: { value: new THREE.Color('#05060f') },
      uGlowA: { value: new THREE.Color('#1aa6d0') },
      uGlowB: { value: new THREE.Color('#a24bd0') }
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uTop, uHorizon, uBottom, uGlowA, uGlowB;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        vec3 col = mix(uHorizon, uTop, smoothstep(0.0, 0.6, d.y));
        col = mix(col, uBottom, smoothstep(0.0, -0.3, d.y));
        col += uGlowA * pow(max(dot(d, normalize(vec3(-0.7, 0.12, -1.0))), 0.0), 6.0) * 0.45;
        col += uGlowB * pow(max(dot(d, normalize(vec3(0.8, 0.22, -1.0))), 0.0), 8.0) * 0.4;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), material);
  mesh.renderOrder = -1;
  return mesh;
}

function createFloor(time) {
  const material = additive(
    { uTime: time, uColor: { value: new THREE.Color('#5a6cff') }, uScan: { value: new THREE.Color('#5ee7ff') } },
    /* glsl */`
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    /* glsl */`
      uniform float uTime;
      uniform vec3 uColor, uScan;
      varying vec3 vWorld;
      float grid(vec2 p, float size) {
        vec2 q = p / size;
        vec2 g = abs(fract(q - 0.5) - 0.5) / fwidth(q);
        return 1.0 - min(min(g.x, g.y), 1.0);
      }
      void main() {
        float d = length(cameraPosition.xz - vWorld.xz);
        float fade = smoothstep(250.0, 18.0, d);
        float lines = max(grid(vWorld.xz, 6.0) * 0.3, grid(vWorld.xz, 30.0));
        // Bands of light sweeping away from the viewer along the floor
        float band = abs(mod(cameraPosition.z - vWorld.z - uTime * 14.0, 90.0) - 45.0);
        float scan = smoothstep(4.0, 0.0, band);
        vec3 col = uColor * lines * 0.45 + uScan * scan * (0.04 + lines * 0.4);
        gl_FragColor = vec4(col * fade, 1.0);
        #include <colorspace_fragment>
      }`
  );
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(520, 1100), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, FLOOR_Y, (FIELD_NEAR + FIELD_FAR) / 2);
  return mesh;
}

function createNodes(nodes, seeds, rand, uniforms) {
  const n = nodes.length;
  const position = new Float32Array(n * 3), color = new Float32Array(n * 3);
  const seed = new Float32Array(n * 3), size = new Float32Array(n);
  nodes.forEach((p, i) => {
    p.toArray(position, i * 3);
    colorAt(p.z, rand).toArray(color, i * 3);
    seeds[i].toArray(seed, i * 3);
    size[i] = 0.7 + Math.pow(rand(), 4) * 2.4;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(color, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));

  const material = additive(uniforms,
    /* glsl */`
      ${COMMON_GLSL}
      uniform float uScale;
      attribute vec3 aSeed;
      attribute vec3 color;
      attribute float aSize;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec4 mv = modelViewMatrix * vec4(drift(position, aSeed), 1.0);
        float d = -mv.z;
        float twinkle = 0.75 + 0.25 * sin(uTime * 1.7 + aSeed.x * 40.0);
        vColor = color;
        vAlpha = depthFade(d) * twinkle;
        gl_PointSize = clamp(aSize * uScale / d, 1.0, 64.0);
        gl_Position = projectionMatrix * mv;
      }`,
    /* glsl */`
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        if (r > 1.0) discard;
        float core = smoothstep(0.34, 0.16, r);
        float halo = pow(1.0 - r, 2.4) * 0.6;
        gl_FragColor = vec4(vColor * (core * 1.1 + halo) + core * 0.35, vAlpha);
        #include <colorspace_fragment>
      }`
  );
  return new THREE.Points(geo, material);
}

function createLinks(nodes, seeds, edges, rand, uniforms) {
  const position = new Float32Array(edges.length * 6), color = new Float32Array(edges.length * 6);
  const seed = new Float32Array(edges.length * 6);
  edges.forEach(([a, b], i) => {
    const c = colorAt((nodes[a].z + nodes[b].z) / 2, rand);
    nodes[a].toArray(position, i * 6);
    nodes[b].toArray(position, i * 6 + 3);
    seeds[a].toArray(seed, i * 6);
    seeds[b].toArray(seed, i * 6 + 3);
    c.toArray(color, i * 6);
    c.toArray(color, i * 6 + 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(color, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));

  const material = additive(uniforms,
    /* glsl */`
      ${COMMON_GLSL}
      attribute vec3 aSeed;
      attribute vec3 color;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec4 mv = modelViewMatrix * vec4(drift(position, aSeed), 1.0);
        vColor = color;
        vAlpha = depthFade(-mv.z) * 0.3;
        gl_Position = projectionMatrix * mv;
      }`,
    /* glsl */`
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        gl_FragColor = vec4(vColor, vAlpha);
        #include <colorspace_fragment>
      }`
  );
  return new THREE.LineSegments(geo, material);
}

// Small bright packets travelling along the links
function createPulses(nodes, seeds, edges, count, rand, uniforms) {
  count = Math.min(count, edges.length);
  const start = new Float32Array(count * 3), end = new Float32Array(count * 3);
  const seedA = new Float32Array(count * 3), seedB = new Float32Array(count * 3);
  const color = new Float32Array(count * 3), timing = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    let [a, b] = edges[Math.floor(rand() * edges.length)];
    if (rand() < 0.5) [a, b] = [b, a];
    nodes[a].toArray(start, i * 3);
    nodes[b].toArray(end, i * 3);
    seeds[a].toArray(seedA, i * 3);
    seeds[b].toArray(seedB, i * 3);
    (rand() < 0.6 ? COLORS[0] : COLORS[4]).toArray(color, i * 3);
    timing[i * 2] = rand();
    timing[i * 2 + 1] = 0.12 + rand() * 0.25;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(start, 3));
  geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 3));
  geo.setAttribute('aSeedA', new THREE.BufferAttribute(seedA, 3));
  geo.setAttribute('aSeedB', new THREE.BufferAttribute(seedB, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(color, 3));
  geo.setAttribute('aTiming', new THREE.BufferAttribute(timing, 2));

  const material = additive(uniforms,
    /* glsl */`
      ${COMMON_GLSL}
      uniform float uScale;
      attribute vec3 aEnd, aSeedA, aSeedB, color;
      attribute vec2 aTiming;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float t = fract(uTime * aTiming.y + aTiming.x);
        vec3 p = mix(drift(position, aSeedA), drift(aEnd, aSeedB), t);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float d = -mv.z;
        vColor = color;
        vAlpha = depthFade(d) * sin(t * 3.1416);
        gl_PointSize = clamp(0.9 * uScale / d, 1.5, 22.0);
        gl_Position = projectionMatrix * mv;
      }`,
    /* glsl */`
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        if (r > 1.0) discard;
        gl_FragColor = vec4(vColor + 0.5 * smoothstep(0.4, 0.0, r), pow(1.0 - r, 1.6) * vAlpha);
        #include <colorspace_fragment>
      }`
  );
  return new THREE.Points(geo, material);
}

function createGlyphAtlas() {
  const cell = 128;
  const canvas = document.createElement('canvas');
  canvas.width = cell * GLYPHS.length;
  canvas.height = cell;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 58px ui-monospace, "SFMono-Regular", Consolas, monospace';
  GLYPHS.forEach((g, i) => ctx.fillText(g, cell * i + cell / 2, cell / 2 + 4));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

// Floating code symbols
function createGlyphs(count, rand, uniforms) {
  const position = new Float32Array(count * 3), color = new Float32Array(count * 3);
  const seed = new Float32Array(count * 3), index = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const p = placeInTube(rand, 20, 44);
    p.toArray(position, i * 3);
    colorAt(p.z, rand).toArray(color, i * 3);
    seed.set([rand(), rand(), rand()], i * 3);
    index[i] = Math.floor(rand() * GLYPHS.length);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(color, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
  geo.setAttribute('aGlyph', new THREE.BufferAttribute(index, 1));

  const material = additive({ ...uniforms, uAtlas: { value: createGlyphAtlas() } },
    /* glsl */`
      ${COMMON_GLSL}
      uniform float uScale;
      attribute vec3 aSeed, color;
      attribute float aGlyph;
      varying vec3 vColor;
      varying float vAlpha, vGlyph;
      void main() {
        vec4 mv = modelViewMatrix * vec4(drift(position, aSeed), 1.0);
        float d = -mv.z;
        vColor = color;
        vGlyph = aGlyph;
        vAlpha = depthFade(d) * 0.55;
        gl_PointSize = clamp(5.5 * uScale / d, 2.0, 140.0);
        gl_Position = projectionMatrix * mv;
      }`,
    /* glsl */`
      uniform sampler2D uAtlas;
      varying vec3 vColor;
      varying float vAlpha, vGlyph;
      void main() {
        vec2 uv = vec2((vGlyph + gl_PointCoord.x) / ${GLYPHS.length}.0, 1.0 - gl_PointCoord.y);
        float a = texture2D(uAtlas, uv).a;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vColor, a * vAlpha);
        #include <colorspace_fragment>
      }`
  );
  return new THREE.Points(geo, material);
}

// Wireframe solids drifting at the edges of the network
function createShapes(rand) {
  const group = new THREE.Group();
  const geometries = [
    new THREE.EdgesGeometry(new THREE.BoxGeometry(5, 5, 5)),
    new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(3.6, 0)),
    new THREE.EdgesGeometry(new THREE.OctahedronGeometry(3.8, 0)),
    new THREE.EdgesGeometry(new THREE.DodecahedronGeometry(3.4, 0))
  ];
  const materials = COLORS.map((c) => additive(
    { uColor: { value: c } },
    /* glsl */`
      varying float vAlpha;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float d = -mv.z;
        vAlpha = smoothstep(240.0, 40.0, d) * smoothstep(4.0, 16.0, d) * 0.5;
        gl_Position = projectionMatrix * mv;
      }`,
    /* glsl */`
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        gl_FragColor = vec4(uColor, vAlpha);
        #include <colorspace_fragment>
      }`
  ));
  for (let z = FIELD_NEAR - 40; z > FIELD_FAR; z -= 55 + rand() * 30) {
    const mesh = new THREE.LineSegments(
      geometries[Math.floor(rand() * geometries.length)],
      materials[Math.floor(rand() * materials.length)]
    );
    const side = rand() < 0.5 ? -1 : 1;
    mesh.position.set(side * (26 + rand() * 30), -4 + rand() * 22, z);
    mesh.rotation.set(rand() * 3, rand() * 3, 0);
    mesh.userData.spin = new THREE.Vector3(rand() - 0.5, rand() - 0.5, 0).multiplyScalar(0.5);
    group.add(mesh);
  }
  return group;
}

export function startNetwork(canvas, { onFirstFrame, reducedMotion = false } = {}) {
  const quality = detectQuality();
  let pixelRatio = Math.min(window.devicePixelRatio || 1, quality.maxPixelRatio);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality.high, powerPreference: 'high-performance' });
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.5, 2200);
  const time = { value: 0 };
  const uniforms = { uTime: time, uScale: { value: 400 } };

  performance.mark('network:build-start');
  const rand = random(20251103);
  const nodes = Array.from({ length: quality.nodes }, () => placeInTube(rand, 16, 58));
  const seeds = nodes.map(() => new THREE.Vector3(rand(), rand(), rand()));
  const edges = linkNodes(nodes, quality.linkDistance, 3);

  const sky = createSky();
  const shapes = createShapes(rand);
  scene.add(
    sky,
    createFloor(time),
    createLinks(nodes, seeds, edges, rand, uniforms),
    createNodes(nodes, seeds, rand, uniforms),
    createPulses(nodes, seeds, edges, quality.pulses, rand, uniforms),
    createGlyphs(quality.glyphs, rand, uniforms),
    shapes
  );
  performance.measure('network:build', 'network:build-start');

  // --- Scroll + pointer input
  let targetProgress = 0, progress = 0;
  let pointerX = 0, pointerY = 0, lookX = 0, lookY = 0;
  function readScroll() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    targetProgress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
  }
  readScroll();
  progress = targetProgress;
  window.addEventListener('scroll', readScroll, { passive: true });
  window.addEventListener('pointermove', (e) => {
    pointerX = (e.clientX / window.innerWidth) * 2 - 1;
    pointerY = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Narrow screens: widen the view so the network still reads
    camera.fov = camera.aspect < 0.8 ? 72 : 60;
    camera.updateProjectionMatrix();
    // World-size to pixel-size factor for the point layers
    uniforms.uScale.value = (h * pixelRatio) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    readScroll();
  }
  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 120); });
  resize();

  // --- Per-frame update
  const lookAt = new THREE.Vector3();
  const weave = (z) => Math.sin(z * 0.012) * 6;

  function updateCamera(dt, snap) {
    const k = snap ? 1 : 1 - Math.exp(-dt * 2.4);
    const kl = snap ? 1 : 1 - Math.exp(-dt * 3);
    progress += (targetProgress - progress) * k;
    lookX += (pointerX - lookX) * kl;
    lookY += (pointerY - lookY) * kl;

    const z = Z_START - progress * TRAVEL;
    camera.position.set(weave(z) + lookX * 2.5, 4 + Math.sin(z * 0.02) * 1.5 - lookY * 1.2 + Math.sin(time.value * 0.6) * 0.15, z);
    lookAt.set(weave(z - 40) + lookX * 7, 1.5 - lookY * 3, z - 40);
    camera.lookAt(lookAt);
    sky.position.copy(camera.position);
  }

  let paused = reducedMotion, running = true, firstFrame = true;
  let last = performance.now();
  let slowFrames = 0, sampled = 0;

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (document.hidden) return;

    const settled = Math.abs(targetProgress - progress) < 1e-4 && Math.abs(pointerX - lookX) < 1e-3 && Math.abs(pointerY - lookY) < 1e-3;
    if (paused && settled && !firstFrame) return;
    if (!paused) {
      time.value += dt;
      shapes.children.forEach((m) => {
        m.rotation.x += m.userData.spin.x * dt;
        m.rotation.y += m.userData.spin.y * dt;
      });
    }

    updateCamera(dt, firstFrame);
    renderer.render(scene, camera);

    // Drop resolution once if the device is struggling
    if (!firstFrame && sampled < 120) {
      sampled++;
      if (dt > 1 / 38) slowFrames++;
      if (sampled === 120 && slowFrames > 60 && pixelRatio > 1) {
        pixelRatio = 1;
        resize();
      }
    }
    if (firstFrame) {
      firstFrame = false;
      performance.measure('network:first-frame', 'network:build-start');
      if (onFirstFrame) onFirstFrame({ quality });
    }
  }
  requestAnimationFrame(frame);

  return {
    setPaused(value) { paused = value; },
    get paused() { return paused; },
    dispose() { running = false; renderer.dispose(); }
  };
}
