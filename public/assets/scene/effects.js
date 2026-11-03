// GPU-animated details: drifting sakura petals, lantern glow + fireflies, river mist.
import * as THREE from 'three';
import { TERRAIN, Z_START, Z_END, random, bankPoint } from './world.js';
import { RIVER_GLSL, NOISE_GLSL } from './glsl.js';

export function createPetals(quality, time) {
  const count = quality.high ? 2600 : 900;
  const box = new THREE.Vector3(90, 34, 110);
  const rnd = random(9);
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = rnd() * box.x;
    positions[i * 3 + 1] = rnd() * box.y;
    positions[i * 3 + 2] = rnd() * box.z;
    for (let j = 0; j < 4; j++) seeds[i * 4 + j] = rnd();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));

  const uniforms = {
    uTime: time,
    uCam: { value: new THREE.Vector3() },
    uBox: { value: box },
    uSize: { value: quality.high ? 46 : 40 },
    uPixelRatio: { value: 1 },
    uLight: { value: 1 },
    uColorA: { value: new THREE.Color(0xffd7e2) },
    uColorB: { value: new THREE.Color(0xf39bb6) }
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */`
      attribute vec4 aSeed;
      uniform float uTime, uSize, uPixelRatio;
      uniform vec3 uCam, uBox;
      varying float vRot, vTint, vFade;
      void main() {
        float t = uTime;
        vec3 p = position;
        p.y -= t * (0.55 + aSeed.x * 0.8);
        p.x += t * (0.8 + aSeed.y * 0.7) + sin(t * (0.5 + aSeed.z) + aSeed.w * 6.283) * 1.8;
        p.z += t * 0.35 + cos(t * (0.4 + aSeed.x) + aSeed.y * 6.283) * 1.4;
        vec3 origin = vec3(uCam.x - uBox.x * 0.5, uCam.y - uBox.y * 0.45, uCam.z - uBox.z * 0.8);
        p = mod(p - origin, uBox) + origin;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float dist = -mv.z;
        gl_PointSize = uSize * (0.55 + aSeed.w * 0.9) * uPixelRatio / max(dist, 0.5);
        vRot = t * (0.8 + aSeed.z * 2.2) + aSeed.x * 6.283;
        vTint = aSeed.y;
        vFade = smoothstep(0.6, 2.5, dist) * (1.0 - smoothstep(uBox.z * 0.55, uBox.z * 0.75, dist));
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColorA, uColorB;
      uniform float uLight;
      varying float vRot, vTint, vFade;
      void main() {
        if (vFade < 0.01) discard;
        vec2 c = gl_PointCoord - 0.5;
        float s = sin(vRot), co = cos(vRot);
        c = mat2(co, -s, s, co) * c;
        c.x /= 0.45 + 0.55 * abs(sin(vRot * 1.7));
        float d = length(c * vec2(1.0, 1.55));
        float notch = 1.0 - smoothstep(0.0, 0.07, length(c - vec2(0.0, 0.31)));
        float alpha = (1.0 - smoothstep(0.36, 0.42, d)) * (1.0 - notch) * vFade;
        if (alpha < 0.02) discard;
        vec3 col = mix(uColorA, uColorB, vTint * (0.6 + c.y));
        gl_FragColor = vec4(col * uLight, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });

  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  return {
    points,
    update(palette, camera, pixelRatio) {
      uniforms.uCam.value.copy(camera.position);
      uniforms.uPixelRatio.value = pixelRatio;
      uniforms.uLight.value = palette.petals;
    }
  };
}

// Soft additive sprites: static lantern halos plus fireflies over the banks at night
export function createGlows(quality, time, lanternPositions) {
  const rnd = random(31);
  const fireflies = quality.high ? 420 : 160;
  const total = lanternPositions.length + fireflies;
  const positions = new Float32Array(total * 3);
  const data = new Float32Array(total * 3); // size, kind (0 lantern / 1 firefly), seed

  lanternPositions.forEach((p, i) => {
    positions.set([p.x, p.y, p.z], i * 3);
    data.set([11, 0, rnd()], i * 3);
  });
  for (let i = 0; i < fireflies; i++) {
    const z = Z_END + rnd() * (Z_START - Z_END);
    const pt = bankPoint(z, rnd() < 0.5 ? -1 : 1, 0.85 + rnd() * 0.6);
    const k = lanternPositions.length + i;
    positions.set([pt.x, Math.max(pt.y, 0) + 0.6 + rnd() * 2.5, pt.z], k * 3);
    data.set([1.3 + rnd() * 1.2, 1, rnd()], k * 3);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aData', new THREE.BufferAttribute(data, 3));

  const uniforms = { uTime: time, uNight: { value: 0 }, uPixelRatio: { value: 1 } };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute vec3 aData;
      uniform float uTime, uNight, uPixelRatio;
      varying float vKind, vAlpha;
      void main() {
        vec3 p = position;
        float seed = aData.z * 6.283;
        vKind = aData.y;
        if (aData.y > 0.5) {
          p += vec3(sin(uTime * 0.5 + seed) * 1.4, sin(uTime * 0.8 + seed * 2.0) * 0.6, cos(uTime * 0.4 + seed) * 1.4);
          vAlpha = uNight * (0.45 + 0.55 * sin(uTime * 2.4 + seed * 3.0));
        } else {
          vAlpha = 0.12 + uNight * 0.9;
        }
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aData.x * 40.0 * uPixelRatio / max(-mv.z, 1.0);
      }`,
    fragmentShader: /* glsl */`
      varying float vKind, vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = exp(-d * d * 5.0) * vAlpha;
        if (a < 0.003) discard;
        vec3 col = vKind > 0.5 ? vec3(0.85, 1.0, 0.45) : vec3(1.0, 0.62, 0.28);
        gl_FragColor = vec4(col * a, 1.0);
        #include <colorspace_fragment>
      }`
  });

  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  return {
    points,
    update(palette, pixelRatio) {
      uniforms.uNight.value = palette.night;
      uniforms.uPixelRatio.value = pixelRatio;
    }
  };
}

// Two drifting layers of low mist that hang over the river
export function createMist(time) {
  const group = new THREE.Group();
  const layers = [];
  [[0.9, 0.022, 0.5], [2.6, 0.012, 0.32]].forEach(([y, scale, strength]) => {
    const uniforms = {
      uTime: time,
      uColor: { value: new THREE.Color() },
      uStrength: { value: strength },
      uScale: { value: scale }
    };
    const material = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */`
        varying vec3 vWorld;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime, uStrength, uScale;
        uniform vec3 uColor;
        varying vec3 vWorld;
        ${RIVER_GLSL}
        ${NOISE_GLSL}
        void main() {
          vec2 p = vWorld.xz;
          float n = fbm(p * uScale + vec2(uTime * 0.015, -uTime * 0.03));
          float ratio = abs(p.x - riverX(p.y)) / riverHalfWidth(p.y);
          float river = 1.0 - smoothstep(0.7, 2.6, ratio);
          float dist = length(cameraPosition - vWorld);
          float near = smoothstep(4.0, 30.0, dist);
          float a = smoothstep(0.35, 0.85, n) * river * near * uStrength;
          if (a < 0.004) discard;
          gl_FragColor = vec4(uColor, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(TERRAIN.width * 0.6, TERRAIN.depth), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, y, TERRAIN.centerZ);
    mesh.renderOrder = 2;
    group.add(mesh);
    layers.push(uniforms);
  });
  return {
    group,
    update(palette) {
      layers.forEach((u) => u.uColor.value.copy(palette.fog).lerp(palette.horizon, 0.25).multiplyScalar(1.05));
    }
  };
}
