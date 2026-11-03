// Time of day. Scrolling down the page moves `t` from 0 (golden hour) to 1 (night);
// every colour and light in the scene is interpolated from these keyframes.
import * as THREE from 'three';

const KEYFRAMES = [
  { t: 0.0, label: 'Golden hour', clock: 17 * 60 + 35,
    top: 0x6f8fbf, horizon: 0xf2c894, bottom: 0xc79a72, fog: 0xd9bf9a, fogDensity: 0.0042,
    sun: 0xffd08f, sunElev: 9, sunAzim: -26, sunIntensity: 2.6,
    hemiSky: 0xffe6c4, hemiGround: 0x4d5a36, hemiIntensity: 1.25,
    water: 0x29484a, ridge: 0x5a6a78, night: 0, petals: 1.0 },
  { t: 0.45, label: 'Sunset', clock: 18 * 60 + 40,
    top: 0x46598f, horizon: 0xf29a62, bottom: 0xa86f58, fog: 0xc99474, fogDensity: 0.0046,
    sun: 0xff9a55, sunElev: 2.5, sunAzim: -22, sunIntensity: 2.2,
    hemiSky: 0xffc39a, hemiGround: 0x3e4430, hemiIntensity: 1.0,
    water: 0x26393f, ridge: 0x4d4f68, night: 0.05, petals: 0.95 },
  { t: 0.72, label: 'Blue hour', clock: 19 * 60 + 25,
    top: 0x1c2550, horizon: 0x8a6c97, bottom: 0x3b3550, fog: 0x4f4a6c, fogDensity: 0.0052,
    sun: 0xb08ad0, sunElev: -5, sunAzim: -10, sunIntensity: 0.55,
    hemiSky: 0x7d7aa8, hemiGround: 0x22242c, hemiIntensity: 0.55,
    water: 0x1a2236, ridge: 0x2c2f4a, night: 0.6, petals: 0.6 },
  { t: 1.0, label: 'Night', clock: 21 * 60 + 10,
    top: 0x070d20, horizon: 0x2a365e, bottom: 0x10162a, fog: 0x1d2644, fogDensity: 0.0052,
    sun: 0xb4c4ff, sunElev: 15, sunAzim: 12, sunIntensity: 0.6,
    hemiSky: 0x5a6cb0, hemiGround: 0x141826, hemiIntensity: 0.62,
    water: 0x111c34, ridge: 0x18203e, night: 1, petals: 0.55 }
];

const COLOR_KEYS = ['top', 'horizon', 'bottom', 'fog', 'sun', 'hemiSky', 'hemiGround', 'water', 'ridge'];
const NUMBER_KEYS = ['fogDensity', 'sunElev', 'sunAzim', 'sunIntensity', 'hemiIntensity', 'night', 'petals', 'clock'];

// Pre-convert hex colours once (THREE.Color stores them in linear space)
const frames = KEYFRAMES.map((k) => {
  const f = { ...k };
  COLOR_KEYS.forEach((key) => { f[key] = new THREE.Color(k[key]); });
  return f;
});

export function createPaletteState() {
  const state = { sunDir: new THREE.Vector3(), label: frames[0].label };
  COLOR_KEYS.forEach((key) => { state[key] = new THREE.Color(); });
  return state;
}

export function samplePalette(t, state) {
  t = Math.min(1, Math.max(0, t));
  let i = 0;
  while (i < frames.length - 2 && t > frames[i + 1].t) i++;
  const a = frames[i], b = frames[i + 1];
  const k = (t - a.t) / (b.t - a.t);
  const s = k * k * (3 - 2 * k);

  COLOR_KEYS.forEach((key) => state[key].copy(a[key]).lerp(b[key], s));
  NUMBER_KEYS.forEach((key) => { state[key] = a[key] + (b[key] - a[key]) * s; });
  state.label = (s < 0.5 ? a : b).label;

  const elev = THREE.MathUtils.degToRad(state.sunElev);
  const azim = THREE.MathUtils.degToRad(state.sunAzim);
  // Azimuth 0 = straight down the valley (-z); negative = to the left
  state.sunDir.set(Math.sin(azim) * Math.cos(elev), Math.sin(elev), -Math.cos(azim) * Math.cos(elev)).normalize();
  return state;
}

export function formatClock(minutes) {
  const h = Math.floor(minutes / 60), m = Math.floor(minutes % 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
