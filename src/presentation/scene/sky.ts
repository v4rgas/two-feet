import * as THREE from "three";
import type { PresentationConfig } from "../presentation.config";

const VERTEX = /* glsl */ `
varying vec3 vDirection;
void main() {
  vDirection = position; // normalized per fragment: no banding across the low-poly sphere
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = clip.xyww; // always on the far plane
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 zenithColor;
uniform vec3 horizonColor;
uniform vec3 glowColor;
uniform vec3 sunDirection;
uniform float gradientPower;
uniform float glowPower;
uniform float glowStrength;
varying vec3 vDirection;
void main() {
  vec3 d = normalize(vDirection);
  float t = pow(clamp(d.y, 0.0, 1.0), gradientPower);
  vec3 color = mix(horizonColor, zenithColor, t);
  // Warm glow around the low sun, strongest near the horizon.
  float sun = pow(max(dot(d, sunDirection), 0.0), glowPower);
  color = mix(color, glowColor, sun * glowStrength * (1.0 - 0.6 * t));
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/**
 * Sky dome (STYLE.md): a soft blue zenith fading to a warm, hazy horizon (the fog colour,
 * so the far ground melts into it), with a warm glow around the low sun. Follows the
 * camera. `sunDirection` is fixed per config (the sun only moves with the board).
 */
export function buildSky(config: PresentationConfig): THREE.Mesh {
  const l = config.lighting;
  const cosEl = Math.cos(l.sunElevationRad);
  const sunDirection = new THREE.Vector3(
    Math.cos(l.sunAzimuthRad) * cosEl,
    Math.sin(l.sunElevationRad),
    -Math.sin(l.sunAzimuthRad) * cosEl,
  ).normalize();
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      zenithColor: { value: new THREE.Color(config.palette.skyZenith) },
      horizonColor: { value: new THREE.Color(config.palette.skyHorizon) },
      glowColor: { value: new THREE.Color(config.palette.sunGlow) },
      sunDirection: { value: sunDirection },
      gradientPower: { value: l.skyGradientPower },
      glowPower: { value: l.sunGlowPower },
      glowStrength: { value: l.sunGlowStrength },
    },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  // The sky is the backdrop: it must match the fog colour exactly, not be tone mapped.
  material.toneMapped = false;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), material);
  sky.name = "sky";
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  return sky;
}
