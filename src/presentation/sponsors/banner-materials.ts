import * as THREE from "three";
import type { PresentationConfig } from "../presentation.config";
import { createCanvas } from "../textures/browser-assets";
import { BANNER_PAINTERS } from "./banner-art";
import { sponsorById } from "./sponsor-registry";

/**
 * One shared material per banner (by resolved registry id), reused by every barrier and
 * level. It shows the art's background colour at once and its canvas art when painted
 * (browser only; tests keep the flat colour).
 */
export class BannerMaterials {
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>();
  private readonly textures: THREE.Texture[] = [];

  constructor(
    private readonly config: PresentationConfig,
    private readonly anisotropy: number,
  ) {}

  /** Width / height of one banner art tile. */
  get artAspect(): number {
    return this.config.banners.widthPx / this.config.banners.heightPx;
  }

  /** The material for a sponsor id, or undefined for an unknown id (a plain barrier). */
  get(sponsorId: string): THREE.MeshStandardMaterial | undefined {
    const entry = sponsorById(sponsorId);
    if (entry === undefined) return undefined;
    const cached = this.materials.get(entry.id);
    if (cached !== undefined) return cached;
    const material = new THREE.MeshStandardMaterial({
      name: `banner:${entry.id}`,
      color: entry.background,
      roughness: this.config.banners.roughness,
      metalness: 0,
    });
    this.materials.set(entry.id, material);
    this.paint(entry.id, material);
    return material;
  }

  private paint(id: string, material: THREE.MeshStandardMaterial): void {
    const painter = BANNER_PAINTERS[id];
    const { widthPx, heightPx } = this.config.banners;
    const surface = createCanvas(widthPx, heightPx);
    if (painter === undefined || surface === null) return;
    painter(surface.ctx, widthPx, heightPx)
      .then(() => {
        const texture = new THREE.CanvasTexture(surface.canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.anisotropy = this.anisotropy;
        this.textures.push(texture);
        material.map = texture;
        material.color.set("#ffffff");
        material.needsUpdate = true;
      })
      .catch(() => {
        // Art failed to load: the banner keeps its background colour.
      });
  }

  dispose(): void {
    for (const m of this.materials.values()) m.dispose();
    for (const t of this.textures) t.dispose();
    this.materials.clear();
    this.textures.length = 0;
  }
}
