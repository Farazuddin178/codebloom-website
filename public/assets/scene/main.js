// Sakura river valley: scene setup, scroll-driven camera journey and render loop.
import * as THREE from 'three';
import { riverX, Z_START, Z_END } from './world.js';
import { createPaletteState, samplePalette, formatClock } from './palette.js';
import { createSky, createRidges } from './sky.js';
import { createTerrain } from './terrain.js';
import { createWater } from './water.js';
import { createFlora } from './flora.js';
import { createStructures, createBoat } from './structures.js';
import { createPetals, createGlows, createMist } from './effects.js';

const CAMERA_HEIGHT = 4.2;
// Boat distance ahead (fraction of the river path) and sideways offset, kept clear of the headline.
// Portrait screens put the boat further away so it sits above the text.
const BOAT_LANDSCAPE = { ahead: 0.03, side: 3.4 };
const BOAT_PORTRAIT = { ahead: 0.05, side: 1.2 };
const LOOK_AHEAD = 0.036;
const PATH_SPAN = 0.9;      // portion of the river covered by a full page scroll

function detectQuality() {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 600;
  const cores = navigator.hardwareConcurrency || 4;
  const high = !coarse && !small && cores >= 4;
  return {
    high,
    reflection: high,
    maxPixelRatio: high ? 1.5 : 1.25
  };
}

export function startValley(canvas, { onPhase, onFirstFrame, reducedMotion = false } = {}) {
  const quality = detectQuality();
  let pixelRatio = Math.min(window.devicePixelRatio || 1, quality.maxPixelRatio);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality.high, powerPreference: 'high-performance' });
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xd9bf9a, 0.0042);

  const camera = new THREE.PerspectiveCamera(52, canvas.clientWidth / canvas.clientHeight, 0.3, 2600);
  const time = { value: 0 };

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  scene.add(hemi, sun, sun.target);

  performance.mark('valley:build-start');
  const sky = createSky();
  const ridges = createRidges();
  const water = createWater(quality, renderer);
  const structures = createStructures();
  const boat = createBoat(structures.materials);
  const petals = createPetals(quality, time);
  const glows = createGlows(quality, time, structures.lights);
  const mist = createMist(time);
  scene.add(sky.mesh, ridges.group, createTerrain(quality), water.mesh, createFlora(quality, time),
    structures.group, boat, petals.points, glows.points, mist.group);
  performance.measure('valley:build', 'valley:build-start');

  // Camera path follows the river with a gentle weave between the banks
  const pathPoints = [];
  for (let z = Z_START; z >= Z_END; z -= 6) {
    pathPoints.push(new THREE.Vector3(riverX(z) + 3.2 * Math.sin(z * 0.021), CAMERA_HEIGHT, z));
  }
  const path = new THREE.CatmullRomCurve3(pathPoints, false, 'centripetal');
  path.arcLengthDivisions = 3000;

  const palette = createPaletteState();
  let lastPaletteT = -1, lastLabel = '', lastClock = '';

  function applyPalette(t) {
    samplePalette(t, palette);
    scene.fog.color.copy(palette.fog);
    scene.fog.density = palette.fogDensity;
    hemi.color.copy(palette.hemiSky);
    hemi.groundColor.copy(palette.hemiGround);
    hemi.intensity = palette.hemiIntensity;
    sun.color.copy(palette.sun);
    sun.intensity = palette.sunIntensity;
    const u = sky.uniforms;
    u.uTop.value.copy(palette.top);
    u.uHorizon.value.copy(palette.horizon);
    u.uBottom.value.copy(palette.bottom);
    u.uSunColor.value.copy(palette.sun);
    u.uSunDir.value.copy(palette.sunDir);
    u.uNight.value = palette.night;
    ridges.update(palette);
    water.update(palette);
    structures.update(palette);
    mist.update(palette);

    const clock = formatClock(palette.clock);
    if (onPhase && (palette.label !== lastLabel || clock !== lastClock)) {
      lastLabel = palette.label;
      lastClock = clock;
      onPhase({ label: palette.label, clock });
    }
  }

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

  let boatPlacement = BOAT_LANDSCAPE;
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Narrow screens: widen the view so the valley still reads
    camera.fov = camera.aspect < 0.8 ? 66 : 52;
    boatPlacement = camera.aspect < 0.8 ? BOAT_PORTRAIT : BOAT_LANDSCAPE;
    camera.updateProjectionMatrix();
    water.resize(w * pixelRatio, h * pixelRatio);
    readScroll();
  }
  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 120); });
  resize();

  // --- Per-frame update
  const camPos = new THREE.Vector3(), lookAt = new THREE.Vector3(), boatPos = new THREE.Vector3();
  const tangent = new THREE.Vector3();

  function updateCamera(dt, snap) {
    const k = snap ? 1 : 1 - Math.exp(-dt * 2.4);
    progress += (targetProgress - progress) * k;
    lookX += (pointerX - lookX) * (snap ? 1 : 1 - Math.exp(-dt * 3));
    lookY += (pointerY - lookY) * (snap ? 1 : 1 - Math.exp(-dt * 3));

    const u = progress * PATH_SPAN;
    path.getPointAt(u, camPos);
    path.getPointAt(Math.min(1, u + LOOK_AHEAD), lookAt);
    camPos.y += Math.sin(time.value * 0.6) * 0.08;
    lookAt.y = 2.1 - lookY * 1.2;
    lookAt.x += lookX * 3.5;
    camera.position.copy(camPos);
    camera.lookAt(lookAt);

    const { ahead, side } = boatPlacement;
    path.getPointAt(Math.min(1, u + ahead), boatPos);
    path.getTangentAt(Math.min(1, u + ahead), tangent);
    boat.position.set(boatPos.x - tangent.z * side, Math.sin(time.value * 1.3) * 0.05, boatPos.z + tangent.x * side);
    boat.rotation.set(Math.sin(time.value * 0.9) * 0.015, Math.atan2(-tangent.x, -tangent.z), Math.sin(time.value * 1.1) * 0.025);
    water.uniforms.uBoatPos.value.set(boat.position.x, boat.position.z);
    water.uniforms.uBoatDir.value.set(tangent.x, tangent.z).normalize();

    // Night falls as the journey reaches the end of the page
    const t = progress;
    if (snap || Math.abs(t - lastPaletteT) > 0.0015) {
      applyPalette(t);
      lastPaletteT = t;
    }
    sun.position.copy(camPos).addScaledVector(palette.sunDir, 200);
    sun.target.position.copy(camPos);
    sky.mesh.position.copy(camPos);
    boat.userData.halo.material.opacity = 0.15 + palette.night * 0.85;
    petals.update(palette, camera, renderer.getPixelRatio());
    glows.update(palette, renderer.getPixelRatio());
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
    if (!paused) time.value += dt;
    sky.uniforms.uTime.value = time.value;
    water.uniforms.uTime.value = time.value;

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
      performance.measure('valley:first-frame', 'valley:build-start');
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
