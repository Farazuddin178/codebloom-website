// Sakura, broadleaf and pine trees, riverbank grass and rocks — all instanced.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from '../../vendor/three/addons/BufferGeometryUtils.js';
import { heightAt, riverX, riverHalfWidth, bankRatio, noise2, fbm, random, TERRAIN, Z_START, Z_END } from './world.js';
import { clearings } from './structures.js';

const CLEARINGS = clearings();
const inClearing = (x, z) => CLEARINGS.some(([cx, cz, r]) => (x - cx) ** 2 + (z - cz) ** 2 < r * r);

const UP = new THREE.Vector3(0, 1, 0);

// Normalise a geometry so it can be merged with others: non-indexed, position/normal/color only
function prep(geo, color, jitter = 0, rnd = Math.random) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  geo.deleteAttribute('uv');
  const n = geo.attributes.position.count;
  const colors = new Float32Array(n * 3);
  const c = new THREE.Color(color);
  for (let i = 0; i < n; i += 3) {
    const k = 1 + (rnd() - 0.5) * jitter;
    for (let j = 0; j < 3; j++) {
      colors[(i + j) * 3] = c.r * k; colors[(i + j) * 3 + 1] = c.g * k; colors[(i + j) * 3 + 2] = c.b * k;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

function cylinderBetween(a, b, rBottom, rTop, radial = 6) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(rTop, rBottom, len, radial, 1, true);
  geo.translate(0, len / 2, 0);
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()));
  geo.translate(a.x, a.y, a.z);
  return geo;
}

// Lumpy blob for foliage; displacement keyed on position so shared vertices stay welded
function blob(radius, rnd, detail = 1) {
  let geo = new THREE.IcosahedronGeometry(radius, detail);
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  geo = mergeVertices(geo);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = 1 + (noise2(x * 2.1 + z * 1.3, y * 2.1 - z) - 0.5) * 0.45;
    pos.setXYZ(i, x * k, y * k * 0.82, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

function growBranches(rnd, start, dir, len, radius, depth, spread, parts, tips) {
  const end = start.clone().addScaledVector(dir, len);
  parts.push(cylinderBetween(start, end, radius, radius * 0.72, depth > 1 ? 6 : 4));
  if (depth === 0) { tips.push(end); return; }
  const count = depth > 1 ? 3 : 2;
  for (let i = 0; i < count; i++) {
    const azim = (i / count) * Math.PI * 2 + rnd() * 1.2;
    const tilt = spread * (0.6 + rnd() * 0.6);
    const d = new THREE.Vector3(Math.sin(azim) * Math.sin(tilt), Math.cos(tilt), Math.cos(azim) * Math.sin(tilt));
    d.lerp(dir, 0.35).normalize();
    growBranches(rnd, end, d, len * (0.7 + rnd() * 0.15), radius * 0.66, depth - 1, spread, parts, tips);
  }
}

// One tree "design": trunk geometry (vertex coloured) + canopy geometry (grey, tinted per instance)
function buildTree(kind, seed) {
  const rnd = random(seed);
  const parts = [], tips = [];
  const canopy = [];

  if (kind === 'pine') {
    parts.push(prep(new THREE.CylinderGeometry(0.18, 0.32, 3, 5), 0x3b2a1e, 0.2, rnd));
    parts[0].translate(0, 1.5, 0);
    for (let i = 0; i < 4; i++) {
      const r = 2.4 - i * 0.5, h = 3.2 - i * 0.35;
      const cone = new THREE.ConeGeometry(r, h, 7);
      cone.translate(0, 2.6 + i * 1.75 + h / 2, 0);
      canopy.push(prep(cone, 0xffffff, 0.08, rnd));
    }
  } else {
    const trunkLen = kind === 'sakura' ? 2.6 : 3.4;
    const lean = new THREE.Vector3((rnd() - 0.5) * 0.4, 1, (rnd() - 0.5) * 0.4).normalize();
    const spread = kind === 'sakura' ? 0.95 : 0.6;
    growBranches(rnd, new THREE.Vector3(), lean, trunkLen, kind === 'sakura' ? 0.42 : 0.36, 2, spread, parts, tips);
    for (let i = 0; i < parts.length; i++) parts[i] = prep(parts[i], kind === 'sakura' ? 0x3a2622 : 0x45352a, 0.25, rnd);
    tips.forEach((tip) => {
      const clumps = kind === 'sakura' ? 3 : 2;
      for (let i = 0; i < clumps; i++) {
        const b = blob((kind === 'sakura' ? 1.05 : 1.35) * (0.75 + rnd() * 0.5), rnd);
        b.translate(tip.x + (rnd() - 0.5) * 1.6, tip.y + (rnd() - 0.3) * 1.0, tip.z + (rnd() - 0.5) * 1.6);
        canopy.push(prep(b, 0xffffff, 0, rnd));
      }
    });
  }

  return { trunk: mergeGeometries(parts), canopy: mergeGeometries(canopy) };
}

// Gentle wind sway for anything instanced, stronger higher up the model.
// `foliage` adds leafy speckle and a brighter crown so canopies don't read as solid blobs.
function addSway(material, time, amount, from, to, foliage = false) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = 'uniform float uTime;\nvarying vec3 vFol;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vFol = position;
       {
         vec3 ip = vec3(instanceMatrix[3]);
         float w = smoothstep(${from.toFixed(2)}, ${to.toFixed(2)}, position.y) * ${amount.toFixed(3)};
         transformed.x += sin(uTime * 1.4 + ip.x * 0.31 + ip.z * 0.17) * w;
         transformed.z += cos(uTime * 1.1 + ip.z * 0.27) * w * 0.7;
       }`
    );
    if (!foliage) return;
    shader.fragmentShader = `varying vec3 vFol;
      float folHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float folNoise(vec3 x) {
        vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(folHash(i), folHash(i + vec3(1,0,0)), f.x), mix(folHash(i + vec3(0,1,0)), folHash(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(folHash(i + vec3(0,0,1)), folHash(i + vec3(1,0,1)), f.x), mix(folHash(i + vec3(0,1,1)), folHash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }\n` + shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
       float leaf = folNoise(vFol * 3.2) * 0.6 + folNoise(vFol * 9.0) * 0.4;
       diffuseColor.rgb *= (0.72 + 0.5 * leaf) * (0.82 + 0.3 * smoothstep(2.0, 9.0, vFol.y));`
    );
  };
}

function instanced(geo, material, matrices, colors) {
  const mesh = new THREE.InstancedMesh(geo, material, matrices.length);
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
  if (colors) colors.forEach((c, i) => mesh.setColorAt(i, c));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

function matrixAt(x, y, z, scale, rotY, tiltX = 0, tiltZ = 0) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tiltX, rotY, tiltZ));
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(scale, scale, scale));
}

// Riverside spots: z in [z0, z1], `ratio` half-widths from the centre on either bank
function bankSpots(rnd, count, z0, z1, ratioMin, ratioMax, minHeight = 0.3) {
  const out = [];
  let guard = count * 30;
  while (out.length < count && guard-- > 0) {
    const z = z0 + rnd() * (z1 - z0);
    const side = rnd() < 0.5 ? -1 : 1;
    const ratio = ratioMin + rnd() * (ratioMax - ratioMin);
    const x = riverX(z) + side * riverHalfWidth(z) * ratio;
    const y = heightAt(x, z);
    if (y > minHeight && y < 9 && !inClearing(x, z)) out.push({ x, y, z, side });
  }
  return out;
}

export function createFlora(quality, time) {
  const group = new THREE.Group();
  const rnd = random(1234);
  const q = quality.high ? 1 : 0.4;

  const trunkMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  addSway(trunkMat, time, 0.06, 3, 10);
  const leafMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  addSway(leafMat, time, 0.16, 2, 10, true);
  const blossomMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x2a1218 });
  addSway(blossomMat, time, 0.18, 2, 10, true);

  // --- Sakura along the banks, densest near the start and around the bridge
  const sakuraDesigns = [buildTree('sakura', 7), buildTree('sakura', 21)];
  const sakuraSpots = [
    ...bankSpots(rnd, Math.round(46 * q + 8), 70, Z_START + 10, 1.0, 1.45),
    ...bankSpots(rnd, Math.round(26 * q + 6), -280, -160, 1.0, 1.5),
    ...bankSpots(rnd, Math.round(30 * q + 4), Z_END - 40, Z_START, 1.05, 1.9)
  ];
  const pinks = [0xf6c1d0, 0xf3a9c0, 0xfad4df, 0xee9bb5].map((h) => new THREE.Color(h));
  sakuraDesigns.forEach((design, d) => {
    const spots = sakuraSpots.filter((_, i) => i % 2 === d);
    const mats = spots.map((s) => matrixAt(s.x, s.y - 0.2, s.z, 1.1 + rnd() * 0.7, rnd() * Math.PI * 2));
    const colors = spots.map(() => pinks[Math.floor(rnd() * pinks.length)].clone().multiplyScalar(0.92 + rnd() * 0.16));
    group.add(instanced(design.trunk, trunkMat, mats));
    group.add(instanced(design.canopy, blossomMat, mats, colors));
  });

  // --- Broadleaf trees on the lower slopes, a few in autumn red
  const broadDesigns = [buildTree('broad', 3), buildTree('broad', 99)];
  const greens = [0x667a3a, 0x5a6e34, 0x7a8a45, 0x8a8f4a].map((h) => new THREE.Color(h));
  const reds = [0xa3271f, 0xc0452a, 0x8e1f1c].map((h) => new THREE.Color(h));
  const broadSpots = bankSpots(rnd, Math.round(300 * q), Z_END - 60, Z_START + 40, 1.25, 2.6, 0.8);
  broadDesigns.forEach((design, d) => {
    const spots = broadSpots.filter((_, i) => i % 2 === d);
    const mats = spots.map((s) => matrixAt(s.x, s.y - 0.3, s.z, 0.9 + rnd() * 0.8, rnd() * Math.PI * 2));
    const colors = spots.map(() => (rnd() < 0.08 ? reds : greens)[Math.floor(rnd() * 3)].clone());
    group.add(instanced(design.trunk, trunkMat, mats));
    group.add(instanced(design.canopy, leafMat, mats, colors));
  });

  // --- Pine forest on the mountainsides
  const pine = buildTree('pine', 5);
  const pineMats = [], pineColors = [];
  const pineTarget = Math.round(2600 * q);
  const pineGreens = [0x24391f, 0x2d4425, 0x1e3220, 0x334a2a].map((h) => new THREE.Color(h));
  let guard = pineTarget * 12;
  while (pineMats.length < pineTarget && guard-- > 0) {
    const x = (rnd() - 0.5) * TERRAIN.width * 0.92;
    const z = TERRAIN.centerZ + (rnd() - 0.5) * TERRAIN.depth * 0.92;
    const ratio = bankRatio(x, z);
    if (ratio < 1.35 || inClearing(x, z)) continue;
    const y = heightAt(x, z);
    if (y < 2 || y > 95) continue;
    if (fbm(x * 0.012, z * 0.012, 3) < 0.42) continue; // forest clumps
    const slope = Math.abs(heightAt(x + 1.5, z) - y) + Math.abs(heightAt(x, z + 1.5) - y);
    if (slope > 2.6) continue;
    pineMats.push(matrixAt(x, y - 0.4, z, 0.8 + rnd() * 1.1, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.08, (rnd() - 0.5) * 0.08));
    pineColors.push(pineGreens[Math.floor(rnd() * pineGreens.length)].clone().multiplyScalar(0.85 + rnd() * 0.3));
  }
  group.add(instanced(pine.trunk, trunkMat, pineMats));
  group.add(instanced(pine.canopy, leafMat, pineMats, pineColors));

  // --- Grass and reeds hugging the shoreline
  const bladeParts = [];
  const brnd = random(77);
  for (let i = 0; i < 9; i++) {
    const h = 0.7 + brnd() * 0.9;
    const blade = new THREE.PlaneGeometry(0.09, h, 1, 3);
    const p = blade.attributes.position;
    for (let v = 0; v < p.count; v++) {
      const t = (p.getY(v) + h / 2) / h;
      p.setX(v, p.getX(v) * (1 - t * 0.9));
      p.setZ(v, t * t * 0.25);
      p.setY(v, t * h);
    }
    blade.rotateY(brnd() * Math.PI);
    blade.translate((brnd() - 0.5) * 0.7, 0, (brnd() - 0.5) * 0.7);
    blade.deleteAttribute('uv');
    const g = blade.toNonIndexed();
    const cols = new Float32Array(g.attributes.position.count * 3);
    const base = new THREE.Color(0x34461f), tip = new THREE.Color(0xc4b56a), c = new THREE.Color();
    for (let v = 0; v < g.attributes.position.count; v++) {
      c.copy(base).lerp(tip, g.attributes.position.getY(v) / h);
      cols[v * 3] = c.r; cols[v * 3 + 1] = c.g; cols[v * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    bladeParts.push(g);
  }
  const grassGeo = mergeGeometries(bladeParts);
  const grassMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  addSway(grassMat, time, 0.22, 0.1, 1.5);
  const grassSpots = bankSpots(rnd, Math.round(5200 * q), Z_END - 40, Z_START + 30, 0.86, 1.3, -0.15);
  group.add(instanced(grassGeo, grassMat,
    grassSpots.map((s) => matrixAt(s.x, s.y - 0.05, s.z, 0.8 + rnd() * 0.8, rnd() * Math.PI * 2))));

  // --- Rocks in the shallows and on the banks
  const rockGeo = prep(blob(1, rnd, 0), 0x77736b, 0.3, rnd);
  const rockSpots = bankSpots(rnd, Math.round(110 * q + 20), Z_END - 40, Z_START + 20, 0.7, 1.1, -2.2);
  group.add(instanced(rockGeo, new THREE.MeshLambertMaterial({ vertexColors: true }),
    rockSpots.map((s) => {
      const m = matrixAt(s.x, s.y + 0.1, s.z, 0.5 + rnd() * 1.4, rnd() * 6, rnd(), rnd());
      return m.multiply(new THREE.Matrix4().makeScale(1.4, 0.6, 1));
    })));

  group.traverse((o) => { o.matrixAutoUpdate = false; o.updateMatrix(); });
  return group;
}
