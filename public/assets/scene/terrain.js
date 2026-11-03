// Valley terrain: a displaced grid with height/slope-based vertex colours.
import * as THREE from 'three';
import { TERRAIN, heightAt, bankRatio, fbm, smoothstep } from './world.js';

const C = (hex) => new THREE.Color(hex);
const MUD = C(0x4b4636);
const SAND = C(0x8f805c);
const GRASS = C(0x6c8a3a);
const GRASS_GOLD = C(0x9a9a4c);
const FOREST = C(0x2c4426);
const ROCK = C(0x6f6a60);
const HIGH = C(0x8d887b);

export function createTerrain(quality) {
  const { width, depth, centerZ } = TERRAIN;
  const segX = quality.high ? 256 : 128;
  const segZ = quality.high ? 400 : 200;

  const geo = new THREE.PlaneGeometry(width, depth, segX, segZ);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, centerZ);

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  }
  geo.computeVertexNormals();

  const normals = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color(), tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const flat = normals.getY(i);
    const n = fbm(x * 0.05, z * 0.05, 3);

    if (y < -0.25) {
      c.copy(MUD).lerp(SAND, smoothstep(-2.6, -0.25, y) * 0.6);
    } else {
      c.copy(GRASS).lerp(GRASS_GOLD, n);
      c.lerp(SAND, 1 - smoothstep(-0.25, 0.6, y));                        // wet shore
      c.lerp(FOREST, smoothstep(3, 14, y) * smoothstep(0.55, 0.85, flat)); // wooded slopes
      c.lerp(ROCK, 1 - smoothstep(0.55, 0.78, flat));                       // cliffs
      c.lerp(HIGH, smoothstep(70, 110, y) * 0.7);
      c.lerp(tmp.copy(FOREST), (bankRatio(x, z) > 1.6 ? 0.25 : 0) * n);    // mottling
    }
    c.multiplyScalar(0.85 + n * 0.3);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.matrixAutoUpdate = false;
  return mesh;
}
