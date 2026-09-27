import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { BOARD_CONFIG, BoardSpec, WHEEL_IDS } from "../../contexts/board";
import { PRESENTATION_CONFIG } from "../presentation.config";
import { buildBoardMesh, deckTopProfile } from "./board-mesh";

const spec = BoardSpec.create(BOARD_CONFIG.spec);

describe("board mesh matches BoardSpec (the collider geometry)", () => {
  it("deck top profile runs tip to tip through the kick bends", () => {
    const [tail, tailBend, noseBend, nose] = deckTopProfile(spec);
    const tailTip = BoardSpec.tailTipLocal(spec);
    const noseTip = BoardSpec.noseTipLocal(spec);
    expect(tail?.x).toBeCloseTo(tailTip.x);
    expect(tail?.y).toBeCloseTo(tailTip.y + spec.deck.thicknessM);
    expect(nose?.x).toBeCloseTo(noseTip.x);
    expect(nose?.y).toBeCloseTo(noseTip.y + spec.deck.thicknessM);
    expect(tailBend?.y).toBeCloseTo(spec.deck.thicknessM / 2);
    expect((noseBend?.x ?? 0) - (tailBend?.x ?? 0)).toBeCloseTo(BoardSpec.flatLengthM(spec));
  });

  it("deck bounds equal the spec: length, width, underside of the flat section", () => {
    const mesh = buildBoardMesh(spec, PRESENTATION_CONFIG);
    const deck = mesh.group.children[0];
    if (!(deck instanceof THREE.Mesh)) throw new Error("no deck mesh");
    const geometry = deck.geometry;
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    expect(box?.max.x).toBeCloseTo(spec.deck.lengthM / 2);
    expect(box?.min.x).toBeCloseTo(-spec.deck.lengthM / 2);
    expect(box?.max.z).toBeCloseTo(spec.deck.widthM / 2);
    expect(box?.min.y).toBeCloseTo(-spec.deck.thicknessM / 2);
    mesh.dispose();
  });

  it("places the four wheels at BoardSpec.wheelCenterLocal", () => {
    const mesh = buildBoardMesh(spec, PRESENTATION_CONFIG);
    expect(mesh.wheels).toHaveLength(4);
    WHEEL_IDS.forEach((id, i) => {
      const c = BoardSpec.wheelCenterLocal(spec, id);
      const p = mesh.wheels[i]?.position;
      expect(p?.x).toBeCloseTo(c.x);
      expect(p?.y).toBeCloseTo(c.y);
      expect(p?.z).toBeCloseTo(c.z);
    });
    mesh.dispose();
  });
});
