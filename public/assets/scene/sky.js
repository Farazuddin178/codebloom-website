// Sky dome (gradient, sun/moon, drifting clouds, stars) and distant mountain ridges.
import * as THREE from 'three';
import { NOISE_GLSL } from './glsl.js';
import { fbm } from './world.js';

export function createSky() {
  const uniforms = {
    uTop: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uBottom: { value: new THREE.Color() },
    uSunColor: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 0.1, -1) },
    uNight: { value: 0 },
    uTime: { value: 0 }
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uTop, uHorizon, uBottom, uSunColor, uSunDir;
      uniform float uNight, uTime;
      varying vec3 vDir;
      ${NOISE_GLSL}
      void main() {
        vec3 dir = normalize(vDir);
        float y = dir.y;
        vec3 col = y > 0.0
          ? mix(uHorizon, uTop, pow(smoothstep(0.0, 0.65, y), 0.62))
          : mix(uHorizon, uBottom, smoothstep(0.0, 0.12, -y));

        float s = max(dot(dir, uSunDir), 0.0);
        float above = smoothstep(-0.03, 0.02, y);
        float disc = smoothstep(0.99935, 0.99965, s) * above;
        col += uSunColor * (pow(s, 7.0) * 0.32 + pow(s, 90.0) * 0.9) * mix(1.0, 0.35, uNight);
        col += uSunColor * disc * mix(9.0, 2.6, uNight);

        // Clouds: fbm projected onto a flat layer above the valley
        if (y > 0.0) {
          vec2 cp = dir.xz / (y + 0.12) * 1.4 + vec2(uTime * 0.008, uTime * 0.004);
          float n = fbm(cp);
          float cover = smoothstep(0.48, 0.82, n) * smoothstep(0.0, 0.18, y);
          vec3 lit = mix(uHorizon * 1.15, uSunColor, 0.35 + 0.4 * pow(s, 3.0));
          vec3 cloud = mix(lit, uTop * 0.85, smoothstep(0.55, 0.95, n) * 0.6);
          col = mix(col, cloud, cover * mix(0.85, 0.55, uNight));

          // Stars
          vec2 sp = floor(dir.xz / (y + 0.35) * 260.0);
          float h = hash12(sp);
          float star = step(0.9965, h) * (0.6 + 0.4 * sin(uTime * 2.0 + h * 80.0));
          col += vec3(star) * uNight * smoothstep(0.05, 0.3, y) * (1.0 - cover);
        }

        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return { mesh, uniforms };
}

// Layered mountain silhouettes beyond the end of the terrain, tinted towards the horizon
export function createRidges() {
  const layers = [
    { z: -1150, base: 150, amp: 230, mix: 0.82, seed: 11 },
    { z: -950, base: 110, amp: 190, mix: 0.68, seed: 4 },
    { z: -780, base: 70, amp: 150, mix: 0.5, seed: 7 }
  ];
  const group = new THREE.Group();
  const materials = layers.map((layer) => {
    const segments = 160, width = 3400;
    const positions = [];
    for (let i = 0; i <= segments; i++) {
      const x = -width / 2 + (i / segments) * width;
      const n = fbm(i * 0.045 + layer.seed, layer.seed * 3.1, 5);
      const top = layer.base + Math.pow(n, 1.6) * layer.amp * 1.6;
      positions.push(x, -40, 0, x, top, 0);
    }
    const index = [];
    for (let i = 0; i < segments; i++) {
      const a = i * 2;
      index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(index);
    const mat = new THREE.MeshBasicMaterial({ fog: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.z = layer.z;
    group.add(mesh);
    return { mat, mix: layer.mix };
  });

  return {
    group,
    update(palette) {
      materials.forEach(({ mat, mix }) => mat.color.copy(palette.ridge).lerp(palette.horizon, mix));
    }
  };
}
