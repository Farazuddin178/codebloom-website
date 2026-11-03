// River surface: planar reflection (desktop) or sky-tinted fallback (mobile),
// animated ripples flowing downstream, shoreline foam and the boat's wake.
import * as THREE from 'three';
import { Reflector } from '../../vendor/three/addons/Reflector.js';
import { TERRAIN } from './world.js';
import { RIVER_GLSL, NOISE_GLSL, FOG_GLSL } from './glsl.js';

const vertexShader = /* glsl */`
  uniform mat4 textureMatrix;
  varying vec4 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = textureMatrix * vec4(position, 1.0);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;

const fragmentShader = /* glsl */`
  uniform vec3 color;
  uniform sampler2D tDiffuse;
  uniform float uTime;
  uniform vec3 uWater, uSky, uHorizon, uSunColor, uSunDir;
  uniform vec2 uBoatPos, uBoatDir;
  uniform float uNight;
  varying vec4 vUv;
  varying vec3 vWorld;
  ${RIVER_GLSL}
  ${NOISE_GLSL}
  ${FOG_GLSL}

  float waterHeight(vec2 p) {
    return vnoise(p * 0.32 + vec2(0.0, uTime * 0.22)) * 0.6
         + vnoise(p * 0.85 + vec2(uTime * 0.12, uTime * 0.55)) * 0.28
         + vnoise(p * 2.4 + vec2(-uTime * 0.35, uTime * 1.1)) * 0.12;
  }

  void main() {
    vec2 p = vWorld.xz;
    float dist = length(cameraPosition - vWorld);

    float e = 0.12;
    float strength = mix(1.6, 0.35, smoothstep(25.0, 220.0, dist));
    float dx = (waterHeight(p + vec2(e, 0.0)) - waterHeight(p - vec2(e, 0.0))) / (2.0 * e);
    float dz = (waterHeight(p + vec2(0.0, e)) - waterHeight(p - vec2(0.0, e))) / (2.0 * e);
    vec3 n = normalize(vec3(-dx * strength, 1.0, -dz * strength));

    vec3 viewDir = normalize(cameraPosition - vWorld);
    float fresnel = 0.06 + 0.94 * pow(1.0 - max(dot(viewDir, n), 0.0), 4.0);

    #ifdef USE_REFLECTION
      vec4 uv = vUv;
      uv.xy += n.xz * uv.w * 0.035;
      vec3 reflection = texture2DProj(tDiffuse, uv).rgb;
    #else
      vec3 r = reflect(-viewDir, n);
      vec3 reflection = mix(uHorizon, uSky, smoothstep(0.0, 0.5, r.y));
    #endif

    // Shallows and foam where the water meets the banks
    float ratio = abs(p.x - riverX(p.y)) / riverHalfWidth(p.y);
    float shallow = smoothstep(0.62, 0.92, ratio);
    vec3 water = mix(uWater, uWater * vec3(1.35, 1.45, 1.2) + vec3(0.02, 0.03, 0.01), shallow);
    float foamNoise = vnoise(p * 1.6 + vec2(0.0, uTime * 0.8));
    float foam = smoothstep(0.84, 0.93, ratio + foamNoise * 0.05) * (0.35 + 0.65 * foamNoise);

    // V-shaped wake trailing the boat
    vec2 rel = p - uBoatPos;
    float behind = -dot(rel, uBoatDir);
    float side = abs(dot(rel, vec2(-uBoatDir.y, uBoatDir.x)));
    if (behind > -1.0) {
      float b = max(behind, 0.0);
      float arm = exp(-pow((side - b * 0.32 - 0.6) / (0.35 + b * 0.05), 2.0)) * exp(-b * 0.07);
      float trail = exp(-pow(side / (0.8 + b * 0.04), 2.0)) * exp(-b * 0.12) * 0.6;
      foam += (arm + trail) * (0.45 + 0.55 * vnoise(p * 3.0 + vec2(0.0, uTime * 2.0)));
    }

    vec3 col = mix(water, reflection, clamp(fresnel * 0.9 + 0.08, 0.0, 1.0));

    vec3 h = normalize(uSunDir + viewDir);
    float spec = pow(max(dot(n, h), 0.0), 220.0) * step(0.0, uSunDir.y + 0.02);
    col += uSunColor * spec * mix(3.0, 1.2, uNight);

    col = mix(col, vec3(0.92, 0.9, 0.86) * (uSky * 0.5 + 0.55), clamp(foam, 0.0, 1.0) * mix(0.55, 0.25, uNight));
    col = applyFog(col, dist);

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export function createWater(quality, renderer) {
  const shader = {
    name: 'RiverShader',
    uniforms: {
      color: { value: null },
      tDiffuse: { value: null },
      textureMatrix: { value: null },
      uTime: { value: 0 },
      uWater: { value: new THREE.Color() },
      uSky: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uSunColor: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3() },
      uBoatPos: { value: new THREE.Vector2() },
      uBoatDir: { value: new THREE.Vector2(0, -1) },
      uNight: { value: 0 },
      uFogColor: { value: new THREE.Color() },
      uFogDensity: { value: 0.004 }
    },
    vertexShader,
    fragmentShader
  };

  const geo = new THREE.PlaneGeometry(TERRAIN.width, TERRAIN.depth);
  let mesh, renderTarget = null;
  const scale = 0.5;

  if (quality.reflection) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    mesh = new Reflector(geo, {
      shader,
      clipBias: 0.003,
      textureWidth: Math.round(size.x * scale),
      textureHeight: Math.round(size.y * scale),
      multisample: 0
    });
    mesh.material.defines = { USE_REFLECTION: '' };
    renderTarget = mesh.getRenderTarget();
  } else {
    const material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(shader.uniforms),
      vertexShader,
      fragmentShader
    });
    material.uniforms.textureMatrix.value = new THREE.Matrix4();
    mesh = new THREE.Mesh(geo, material);
  }

  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, 0, TERRAIN.centerZ);

  const u = mesh.material.uniforms;
  return {
    mesh,
    uniforms: u,
    resize(width, height) {
      if (renderTarget) renderTarget.setSize(Math.round(width * scale), Math.round(height * scale));
    },
    update(palette) {
      u.uWater.value.copy(palette.water);
      u.uSky.value.copy(palette.top);
      u.uHorizon.value.copy(palette.horizon);
      u.uSunColor.value.copy(palette.sun);
      u.uSunDir.value.copy(palette.sunDir);
      u.uNight.value = palette.night;
      u.uFogColor.value.copy(palette.fog);
      u.uFogDensity.value = palette.fogDensity;
    }
  };
}
