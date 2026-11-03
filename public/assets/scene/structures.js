// Hand-built landmarks: red arched bridge, five-storey pagoda, torii gate,
// temple hall, stone lanterns and the boat. Everything is merged per material.
import * as THREE from 'three';
import { mergeGeometries } from '../../vendor/three/addons/BufferGeometryUtils.js';
import { heightAt, riverX, riverSlope, riverHalfWidth, bankPoint, random, Z_START, Z_END } from './world.js';

export const BRIDGE_Z = 128;
export const PAGODA = { z: 30, side: 1, ratio: 1.6, scale: 1.5 };
export const TORII = { z: -64, side: -1, ratio: 1.0 };
export const TEMPLE = { z: -92, side: -1, ratio: 1.75 };

// Ground the trees should keep clear of: [x, z, radius]
export function clearings() {
  return [[PAGODA, 17], [TORII, 6], [TEMPLE, 11]].map(([s, r]) => {
    const p = bankPoint(s.z, s.side, s.ratio);
    return [p.x, p.z, r];
  });
}

const dummy = new THREE.Object3D();

function place(geo, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  dummy.position.set(x, y, z);
  dummy.rotation.set(rx, ry, rz);
  dummy.scale.set(sx, sy, sz);
  dummy.updateMatrix();
  geo = geo.index ? geo.toNonIndexed() : geo.clone();
  geo.deleteAttribute('uv');
  return geo.applyMatrix4(dummy.matrix);
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

// Bucket of geometries per material, merged into one mesh each at the end
class Builder {
  constructor() { this.parts = new Map(); }
  add(material, geo) {
    if (!this.parts.has(material)) this.parts.set(material, []);
    this.parts.get(material).push(geo);
  }
  build() {
    const group = new THREE.Group();
    this.parts.forEach((geos, material) => group.add(new THREE.Mesh(mergeGeometries(geos), material)));
    return group;
  }
}

function makeMaterials() {
  return {
    vermilion: new THREE.MeshLambertMaterial({ color: 0xb8361f }),
    wood: new THREE.MeshLambertMaterial({ color: 0x4f3424 }),
    darkWood: new THREE.MeshLambertMaterial({ color: 0x2c2019 }),
    wall: new THREE.MeshLambertMaterial({ color: 0xe8dcc6 }),
    roof: new THREE.MeshLambertMaterial({ color: 0x2f2c2c, side: THREE.DoubleSide }),
    stone: new THREE.MeshLambertMaterial({ color: 0x8a857a }),
    gold: new THREE.MeshLambertMaterial({ color: 0xb48a3c }),
    straw: new THREE.MeshLambertMaterial({ color: 0x9c8452, side: THREE.DoubleSide }),
    cloth: new THREE.MeshLambertMaterial({ color: 0x3d4a5c }),
    skin: new THREE.MeshLambertMaterial({ color: 0xc89c7a }),
    // Lanterns and windows: brightness is driven by the time of day
    glow: new THREE.MeshBasicMaterial({ color: 0xffb35c })
  };
}

// Flared hip roof: a 4-sided lathe with a concave profile
function roofGeometry(halfSize, height, overhang, stretchX = 1) {
  const rOut = (halfSize + overhang) * Math.SQRT2;
  const rIn = halfSize * 0.25 * Math.SQRT2;
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    pts.push(new THREE.Vector2(rIn + (rOut - rIn) * (1 - t) * (1 - t * 0.35), height * Math.pow(t, 0.8) - (1 - t) * 0.12 * height));
  }
  pts.reverse();
  const geo = new THREE.LatheGeometry(pts, 4);
  geo.rotateY(Math.PI / 4);
  geo.scale(stretchX, 1, 1);
  return geo;
}

function buildBridge(m, b) {
  const z = BRIDGE_Z;
  const w = riverHalfWidth(z);
  const L = w * 2 + 16;
  const H = 6.6, base = 1.0, deckW = 3.4;
  const arch = (x) => base + H * (1 - Math.pow((2 * x) / L, 2));
  const N = 30;
  const group = new Builder();

  for (let i = 0; i < N; i++) {
    const x0 = -L / 2 + (i / N) * L, x1 = -L / 2 + ((i + 1) / N) * L;
    const y0 = arch(x0), y1 = arch(x1);
    const len = Math.hypot(x1 - x0, y1 - y0) + 0.05;
    const ang = Math.atan2(y1 - y0, x1 - x0);
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    group.add(m.wood, place(box(len, 0.32, deckW), mx, my, 0, 0, 0, ang));
    group.add(m.vermilion, place(box(len, 0.5, 0.18), mx, my - 0.2, deckW / 2, 0, 0, ang));
    group.add(m.vermilion, place(box(len, 0.5, 0.18), mx, my - 0.2, -deckW / 2, 0, 0, ang));
    for (const side of [-1, 1]) {
      group.add(m.vermilion, place(box(len, 0.14, 0.16), mx, my + 1.05, side * (deckW / 2 - 0.1), 0, 0, ang));
      group.add(m.vermilion, place(box(len, 0.1, 0.1), mx, my + 0.55, side * (deckW / 2 - 0.1), 0, 0, ang));
      if (i % 2 === 0) group.add(m.vermilion, place(box(0.2, 1.15, 0.2), x0, y0 + 0.55, side * (deckW / 2 - 0.1)));
    }
  }
  // End posts with brass caps
  for (const ex of [-L / 2, L / 2]) {
    for (const side of [-1, 1]) {
      group.add(m.vermilion, place(box(0.32, 1.6, 0.32), ex, arch(ex) + 0.8, side * (deckW / 2 - 0.1)));
      group.add(m.gold, place(new THREE.SphereGeometry(0.24, 8, 6), ex, arch(ex) + 1.75, side * (deckW / 2 - 0.1)));
    }
  }
  // Piers standing in the river
  for (const px of [-0.36, -0.14, 0.14, 0.36]) {
    const x = px * L, top = arch(x) - 0.2, bottom = -3;
    for (const side of [-1, 1]) {
      group.add(m.vermilion, place(box(0.34, top - bottom, 0.34), x, (top + bottom) / 2, side * (deckW / 2 - 0.3)));
    }
    group.add(m.darkWood, place(box(0.28, 0.28, deckW), x, top - 0.6, 0));
  }

  const mesh = group.build();
  mesh.position.set(riverX(z), 0, z);
  mesh.rotation.y = Math.atan(riverSlope(z));
  b.add(mesh);

  // Lantern glows at both ends of the bridge
  const lights = [];
  for (const ex of [-L / 2 - 1.5, L / 2 + 1.5]) {
    const v = new THREE.Vector3(ex, 0, deckW / 2 + 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), mesh.rotation.y);
    const x = mesh.position.x + v.x, zz = z + v.z;
    lights.push(stoneLantern(m, b, x, heightAt(x, zz), zz));
  }
  return lights;
}

function stoneLantern(m, b, x, y, z, s = 1) {
  const g = new Builder();
  g.add(m.stone, place(new THREE.CylinderGeometry(0.5, 0.6, 0.3, 6), 0, 0.15, 0));
  g.add(m.stone, place(new THREE.CylinderGeometry(0.17, 0.22, 1.1, 6), 0, 0.85, 0));
  g.add(m.stone, place(box(0.8, 0.14, 0.8), 0, 1.45, 0));
  g.add(m.glow, place(box(0.46, 0.5, 0.46), 0, 1.77, 0));
  g.add(m.stone, place(new THREE.ConeGeometry(0.72, 0.45, 6), 0, 2.25, 0));
  g.add(m.stone, place(new THREE.SphereGeometry(0.14, 6, 4), 0, 2.55, 0));
  const mesh = g.build();
  mesh.position.set(x, y - 0.1, z);
  mesh.scale.setScalar(s);
  b.add(mesh);
  return new THREE.Vector3(x, y - 0.1 + 1.77 * s, z);
}

function buildPagoda(m, b) {
  const { x, z } = bankPoint(PAGODA.z, PAGODA.side, PAGODA.ratio);
  const S = PAGODA.scale;
  let y = Infinity;
  for (const dx of [-6, 0, 6]) for (const dz of [-6, 0, 6]) y = Math.min(y, heightAt(x + dx * S, z + dz * S));
  const g = new Builder();
  const lights = [];
  g.add(m.stone, place(box(10, 3, 10), 0, -1.2, 0));
  let level = 0.3;
  for (let i = 0; i < 5; i++) {
    const s = 6.4 - i * 0.85, h = i === 0 ? 2.8 : 2.0;
    g.add(m.wall, place(box(s, h, s), 0, level + h / 2, 0));
    for (const cx of [-1, 1]) for (const cz of [-1, 1]) {
      g.add(m.vermilion, place(box(0.32, h, 0.32), cx * (s / 2 - 0.1), level + h / 2, cz * (s / 2 - 0.1)));
    }
    g.add(m.vermilion, place(box(s + 0.2, 0.35, s + 0.2), 0, level + h - 0.1, 0));
    // Glowing window on each face
    for (let f = 0; f < 4; f++) {
      const a = (f * Math.PI) / 2;
      g.add(m.glow, place(box(s * 0.32, h * 0.42, 0.06), Math.sin(a) * (s / 2 + 0.03), level + h * 0.45, Math.cos(a) * (s / 2 + 0.03), 0, a));
    }
    lights.push(new THREE.Vector3(x, y + (level + h * 0.45) * S, z));
    level += h;
    g.add(m.roof, place(roofGeometry(s / 2, 1.1, 1.5), 0, level - 0.05, 0));
    level += 0.55;
  }
  g.add(m.gold, place(new THREE.CylinderGeometry(0.1, 0.14, 4.2, 6), 0, level + 2.1, 0));
  for (let r = 0; r < 6; r++) g.add(m.gold, place(new THREE.CylinderGeometry(0.34 - r * 0.02, 0.34 - r * 0.02, 0.08, 10), 0, level + 0.9 + r * 0.42, 0));
  const mesh = g.build();
  mesh.position.set(x, y, z);
  mesh.rotation.y = 0.35;
  mesh.scale.setScalar(S);
  b.add(mesh);
  return lights;
}

function buildTorii(m, b) {
  const { x, z } = bankPoint(TORII.z, TORII.side, TORII.ratio);
  const y = heightAt(x, z);
  const g = new Builder();
  for (const px of [-2.6, 2.6]) {
    g.add(m.vermilion, place(new THREE.CylinderGeometry(0.28, 0.34, 6.4, 10), px, 3.2, 0));
    g.add(m.darkWood, place(new THREE.CylinderGeometry(0.4, 0.4, 0.5, 10), px, 0.25, 0));
  }
  g.add(m.vermilion, place(box(6.8, 0.36, 0.36), 0, 4.8, 0));
  g.add(m.vermilion, place(box(0.3, 1.0, 0.3), 0, 5.4, 0));
  // Kasagi: the top beam curving up at both ends
  for (let i = 0; i < 12; i++) {
    const x0 = -4.4 + (i / 12) * 8.8, x1 = x0 + 8.8 / 12;
    const lift = (u) => 0.035 * u * u;
    const y0 = 6.1 + lift(x0), y1 = 6.1 + lift(x1);
    const ang = Math.atan2(y1 - y0, x1 - x0);
    g.add(m.vermilion, place(box(8.8 / 12 + 0.04, 0.42, 0.7), (x0 + x1) / 2, (y0 + y1) / 2, 0, 0, 0, ang));
    g.add(m.darkWood, place(box(8.8 / 12 + 0.04, 0.22, 0.86), (x0 + x1) / 2, (y0 + y1) / 2 + 0.32, 0, 0, 0, ang));
  }
  const mesh = g.build();
  mesh.position.set(x, y - 0.2, z);
  mesh.rotation.y = Math.atan(riverSlope(z)) + Math.PI / 2 + 0.25;
  b.add(mesh);
}

function buildTemple(m, b) {
  const { x, z } = bankPoint(TEMPLE.z, TEMPLE.side, TEMPLE.ratio);
  let y = Infinity;
  for (const dx of [-6, 0, 6]) for (const dz of [-4, 0, 4]) y = Math.min(y, heightAt(x + dx, z + dz));
  const g = new Builder();
  g.add(m.stone, place(box(13, 3, 9), 0, -1, 0));
  g.add(m.wall, place(box(10, 3.2, 6), 0, 2.1, 0));
  for (let i = -2; i <= 2; i++) {
    g.add(m.vermilion, place(box(0.34, 3.2, 0.34), i * 2.4, 2.1, 3.1));
    g.add(m.vermilion, place(box(0.34, 3.2, 0.34), i * 2.4, 2.1, -3.1));
  }
  g.add(m.vermilion, place(box(10.4, 0.4, 6.4), 0, 3.6, 0));
  g.add(m.glow, place(box(1.6, 2.0, 0.05), -2.4, 1.6, 3.05));
  g.add(m.glow, place(box(1.6, 2.0, 0.05), 2.4, 1.6, 3.05));
  g.add(m.roof, place(roofGeometry(3.4, 2.6, 2.0, 1.55), 0, 3.75, 0));
  const mesh = g.build();
  mesh.position.set(x, y, z);
  mesh.rotation.y = Math.atan(riverSlope(z)) + Math.PI / 2;
  b.add(mesh);
  return [new THREE.Vector3(x, y + 1.6, z)];
}

export function createBoat(m) {
  m = m || makeMaterials();
  const hull = new THREE.BoxGeometry(1.8, 0.75, 6.6, 4, 2, 18);
  const p = hull.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i);
    const zz = p.getZ(i);
    const t = Math.abs(zz) / 3.3;
    x *= (1 - Math.pow(t, 2.2) * 0.88) * (y < 0 ? 0.62 : 1);
    y += Math.pow(t, 3) * 0.75;
    p.setXYZ(i, x, y, zz);
  }
  hull.computeVertexNormals();

  const hullWood = new THREE.MeshLambertMaterial({ color: 0x8a5a36 });
  const g = new Builder();
  g.add(hullWood, place(hull, 0, 0.12, 0));
  g.add(m.darkWood, place(box(1.5, 0.08, 4.4), 0, 0.5, 0));
  // Woven canopy over the middle of the boat
  g.add(m.straw, place(new THREE.CylinderGeometry(0.98, 0.98, 2.6, 14, 1, true, Math.PI / 2, Math.PI), 0, 0.55, -0.2, -Math.PI / 2));
  for (const rz of [-1.4, -0.2, 1.0]) {
    g.add(m.darkWood, place(new THREE.TorusGeometry(0.99, 0.045, 4, 14, Math.PI), 0, 0.55, rz));
  }
  // Boatman at the stern with a conical hat and pole
  g.add(m.cloth, place(new THREE.CylinderGeometry(0.2, 0.3, 1.15, 8), 0, 1.1, 2.4));
  g.add(m.skin, place(new THREE.SphereGeometry(0.17, 8, 6), 0, 1.83, 2.4));
  g.add(m.straw, place(new THREE.ConeGeometry(0.5, 0.28, 12), 0, 2.05, 2.4));
  g.add(m.darkWood, place(new THREE.CylinderGeometry(0.035, 0.035, 5.2, 5), 0.45, 1.4, 3.2, 0.5, 0, -0.18));
  // Paper lantern hanging at the bow
  g.add(m.darkWood, place(new THREE.CylinderGeometry(0.03, 0.03, 1.3, 4), 0, 1.25, -2.7));
  g.add(m.glow, place(new THREE.SphereGeometry(0.2, 10, 8), 0, 1.75, -2.7, 0, 0, 0, 1, 1.25, 1));
  const boat = g.build();

  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color: 0xffb35c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0
  }));
  halo.position.set(0, 1.75, -2.7);
  halo.scale.setScalar(3.2);
  boat.add(halo);
  boat.userData.halo = halo;
  return boat;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createStructures() {
  const m = makeMaterials();
  const group = new THREE.Group();
  const lights = [];

  lights.push(...buildBridge(m, group));
  lights.push(...buildPagoda(m, group));
  buildTorii(m, group);
  lights.push(...buildTemple(m, group));

  // Stone lanterns along alternate banks
  const rnd = random(42);
  for (let z = Z_START - 20; z > Z_END - 30; z -= 22 + rnd() * 10) {
    const side = rnd() < 0.5 ? -1 : 1;
    const pt = bankPoint(z, side, 1.02 + rnd() * 0.12);
    if (pt.y < 0.2 || Math.abs(z - BRIDGE_Z) < 12) continue;
    lights.push(stoneLantern(m, group, pt.x, pt.y, pt.z, 0.9 + rnd() * 0.3));
  }

  group.traverse((o) => { o.matrixAutoUpdate = false; o.updateMatrix(); });
  const warm = new THREE.Color(0xffb35c);

  return {
    group,
    lights,
    materials: m,
    update(palette) {
      m.glow.color.copy(warm).multiplyScalar(0.35 + palette.night * 2.4);
    }
  };
}
