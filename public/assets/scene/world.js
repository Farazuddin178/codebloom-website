// Shape of the valley: the river's course, the terrain height field, and
// seeded noise/random helpers shared by everything that gets scattered on it.

function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x, y, octaves = 4) {
  let sum = 0, amp = 0.5, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2(x * freq + i * 17.3, y * freq - i * 9.1);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

export function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Small seeded PRNG so the valley looks identical on every visit
export function random(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The camera travels downstream from Z_START to Z_END (towards -z)
export const Z_START = 250;
export const Z_END = -360;

export const TERRAIN = { width: 640, depth: 1000, centerZ: -180 };

// Keep these three in sync with RIVER_GLSL in glsl.js
export const riverX = (z) => 26 * Math.sin(z * 0.011) + 9 * Math.sin(z * 0.027 + 1.3);
export const riverSlope = (z) => 26 * 0.011 * Math.cos(z * 0.011) + 9 * 0.027 * Math.cos(z * 0.027 + 1.3);
export const riverHalfWidth = (z) => 20 + 6 * Math.sin(z * 0.019 + 0.5);

export const BED_DEPTH = -2.6;

export function heightAt(x, z) {
  const w = riverHalfWidth(z);
  const d = Math.abs(x - riverX(z));

  // River bed rising to grassy banks a little above the water line
  const bank = smoothstep(w * 0.55, w * 1.15, d);
  let h = BED_DEPTH + bank * 3.8;
  h += bank * (fbm(x * 0.045, z * 0.045, 3) - 0.5) * 2.2;

  // Mountains climbing away from the river on both sides
  const m = smoothstep(w * 1.1, w * 3.6, d);
  h += m * m * (34 + 62 * fbm(x * 0.006 + 3.1, z * 0.006 - 2.4, 4));
  h += m * (fbm(x * 0.03, z * 0.03, 3) - 0.35) * 10;
  return h;
}

// Distance from the river centre measured in half-widths (≈0.92 is the shoreline)
export function bankRatio(x, z) {
  return Math.abs(x - riverX(z)) / riverHalfWidth(z);
}

// A point on one bank at `ratio` half-widths from the centre
export function bankPoint(z, side, ratio) {
  const x = riverX(z) + side * riverHalfWidth(z) * ratio;
  return { x, y: heightAt(x, z), z };
}
