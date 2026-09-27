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
uniform vec3 topColor;
uniform vec3 bottomColor;
varying vec3 vDirection;
void main() {
  float t = clamp(normalize(vDirection).y, 0.0, 1.0);
  t = pow(t, 0.6);
  gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
  #include <colorspace_fragment>
}
`;

/** Sky dome with the warm-top / cool-horizon gradient (STYLE.md palette). Follows the camera. */
export function buildSky(config: PresentationConfig): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      topColor: { value: new THREE.Color(config.palette.skyTop) },
      bottomColor: { value: new THREE.Color(config.palette.skyBottom) },
    },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), material);
  sky.name = "sky";
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  return sky;
}
