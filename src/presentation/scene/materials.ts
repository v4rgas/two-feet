import * as THREE from "three";
import type { PresentationConfig } from "../presentation.config";
import type { TextureLibrary } from "../textures/texture-library";

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

/** The level surface tones that have their own shared material. */
export type SurfaceTone = "ground" | "body" | "edge" | "metal";
export const SURFACE_TONES: readonly SurfaceTone[] = ["ground", "body", "edge", "metal"];

type SurfaceSpec = PresentationConfig["surfaces"]["ground"];

/**
 * Darkens vertical faces near the ground (y = 0): a cheap, per-pixel stand-in for the
 * ambient occlusion where a wall meets the floor. Merged level meshes are in world space.
 */
function addContactShade(
  material: THREE.MeshStandardMaterial,
  heightM: number,
  strength: number,
): void {
  const h = heightM.toFixed(4);
  const s = strength.toFixed(4);
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying float vContactY;\nvarying float vContactUp;",
      )
      .replace(
        "#include <project_vertex>",
        [
          "#include <project_vertex>",
          "vContactY = (modelMatrix * vec4(transformed, 1.0)).y;",
          "vContactUp = normalize(mat3(modelMatrix) * objectNormal).y;",
        ].join("\n"),
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying float vContactY;\nvarying float vContactUp;",
      )
      .replace(
        "#include <color_fragment>",
        [
          "#include <color_fragment>",
          "float contactWall = 1.0 - smoothstep(0.35, 0.8, abs(vContactUp));",
          `float contactNear = 1.0 - smoothstep(0.0, ${h}, vContactY);`,
          `diffuseColor.rgb *= 1.0 - ${s} * contactWall * contactNear;`,
        ].join("\n"),
      );
  };
  material.customProgramCacheKey = () => `contact-shade:${h}:${s}`;
}

/**
 * The level's shared surface materials (one per tone, reused by every level and mesh).
 * Flat palette colours at first; each tone's CC0 texture set is applied when it loads,
 * with the colour divided by the detail map's mean so the palette token still reads.
 */
export class SurfaceMaterials {
  private readonly materials: Record<SurfaceTone, THREE.MeshStandardMaterial>;
  readonly joint: THREE.LineBasicMaterial;

  constructor(
    private readonly config: PresentationConfig,
    textures: TextureLibrary | null,
  ) {
    const s = config.surfaces;
    const make = (tone: SurfaceTone): THREE.MeshStandardMaterial => {
      const spec: SurfaceSpec = s[tone];
      const material = flatMaterial(spec.color);
      material.name = `surface:${tone}`;
      material.roughness = spec.roughness;
      material.metalness = spec.metalness;
      if (tone !== "metal")
        addContactShade(material, s.contactShadeHeightM, s.contactShadeStrength);
      return material;
    };
    this.materials = {
      ground: make("ground"),
      body: make("body"),
      edge: make("edge"),
      metal: make("metal"),
    };
    this.joint = new THREE.LineBasicMaterial({
      color: config.palette.concrete600,
      transparent: true,
      opacity: config.ground.slabJointOpacity,
    });
    if (textures !== null) {
      for (const tone of SURFACE_TONES) this.applyTextures(tone, textures);
    }
  }

  get(tone: SurfaceTone): THREE.MeshStandardMaterial {
    return this.materials[tone];
  }

  /** World metres per texture repeat of a tone (UVs are generated in tiles). */
  metresPerRepeat(tone: SurfaceTone): number {
    return this.config.surfaces[tone].metresPerRepeat;
  }

  private applyTextures(tone: SurfaceTone, textures: TextureLibrary): void {
    const spec: SurfaceSpec = this.config.surfaces[tone];
    const pending = textures.load(spec.textureSet);
    if (pending === null) return;
    pending
      .then((set) => {
        const material = this.materials[tone];
        material.map = set.map;
        material.normalMap = set.normalMap;
        material.normalScale.set(spec.normalScale, spec.normalScale);
        material.roughnessMap = set.roughnessMap;
        material.color.set(spec.color).multiplyScalar(1 / this.config.surfaces.detailMeanLinear);
        material.needsUpdate = true;
      })
      .catch(() => {
        // Missing texture: the flat palette colour stays (STYLE.md fallback).
      });
  }

  dispose(): void {
    for (const tone of SURFACE_TONES) this.materials[tone].dispose();
    this.joint.dispose();
  }
}
