import * as THREE from "three";

/** STYLE.md: every surface is a flat-shaded `MeshStandardMaterial`. */
export function flatMaterial(color: string, opacity = 1): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color,
    flatShading: true,
    roughness: 0.9,
    metalness: 0,
  });
  if (opacity < 1) {
    material.transparent = true;
    material.opacity = opacity;
  }
  return material;
}
