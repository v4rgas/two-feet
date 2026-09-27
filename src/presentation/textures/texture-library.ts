import * as THREE from "three";
import { canLoadImages, publicUrl } from "./browser-assets";

/** One CC0 PBR set from `public/textures/<name>/` (see public/textures/LICENSES.md). */
export interface TextureSet {
  readonly map: THREE.Texture;
  readonly normalMap: THREE.Texture;
  readonly roughnessMap: THREE.Texture;
}

/**
 * Loads each texture set once and shares it between every material and level that uses
 * it (one GPU upload per image). Textures repeat (world-space UVs, in tiles), with
 * mipmaps and anisotropic filtering. In Node (tests) nothing loads: `load` gives null
 * and materials keep their flat palette colours.
 */
export class TextureLibrary {
  private readonly sets = new Map<string, Promise<TextureSet>>();
  private readonly loaded: THREE.Texture[] = [];
  private readonly loader: THREE.TextureLoader | null;

  constructor(private readonly anisotropy: number) {
    this.loader = canLoadImages() ? new THREE.TextureLoader() : null;
  }

  /** The set's textures, or null where images cannot load. Rejects if a file is missing. */
  load(name: string): Promise<TextureSet> | null {
    const loader = this.loader;
    if (loader === null) return null;
    const cached = this.sets.get(name);
    if (cached !== undefined) return cached;
    const one = async (file: string, color: boolean): Promise<THREE.Texture> => {
      const texture = await loader.loadAsync(publicUrl(`textures/${name}/${file}`));
      texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = this.anisotropy;
      texture.needsUpdate = true;
      this.loaded.push(texture);
      return texture;
    };
    const promise = Promise.all([
      one("color.webp", true),
      one("normal.webp", false),
      one("roughness.webp", false),
    ]).then(([map, normalMap, roughnessMap]) => ({ map, normalMap, roughnessMap }));
    this.sets.set(name, promise);
    return promise;
  }

  dispose(): void {
    for (const texture of this.loaded) texture.dispose();
    this.loaded.length = 0;
    this.sets.clear();
  }
}
