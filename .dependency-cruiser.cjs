/**
 * Architecture lint: encodes the layer rules of REQUIREMENTS §2.3 (see ADR 0001).
 * Run with `pnpm lint`. Type-only imports are checked too (tsPreCompilationDeps).
 *
 * Paths are matched against RESOLVED file paths, so npm packages look like
 * `node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>/…`; NPM() matches either layout.
 */

/** Regex matching any file inside one of the given npm packages. */
const NPM = (...pkgs) => `(^|/)node_modules/(${pkgs.join("|")})/`;

const TEST_FILE = "\\.test\\.ts$";
const VITEST = NPM("vitest", "@vitest/[^/]+");
const ENGINES = NPM("three", "@types/three", "@dimforge/[^/]+", "lil-gui");

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // ── Rule 1: domain is pure ─────────────────────────────────────────────
    {
      name: "domain-is-pure",
      comment:
        "§2.3.1 — domain/ imports only its own context's domain/ (and its <ctx>.config.ts) " +
        "and src/shared. Never three, @dimforge, other contexts, or any other package.",
      severity: "error",
      from: { path: "^src/contexts/([^/]+)/domain/", pathNot: TEST_FILE },
      to: {
        pathNot: [
          "^src/contexts/$1/domain/",
          "^src/contexts/$1/[^/]+\\.config\\.ts$",
          "^src/shared/",
        ],
      },
    },
    {
      name: "domain-tests-are-pure",
      comment: "Domain tests follow the domain rule, plus vitest.",
      severity: "error",
      from: { path: `^src/contexts/([^/]+)/domain/.+${TEST_FILE}` },
      to: {
        pathNot: [
          "^src/contexts/$1/domain/",
          "^src/contexts/$1/[^/]+\\.config\\.ts$",
          "^src/shared/",
          VITEST,
        ],
      },
    },
    {
      name: "config-is-pure",
      comment: "<ctx>.config.ts is plain data: only its own domain and src/shared.",
      severity: "error",
      from: { path: "^src/contexts/([^/]+)/[^/]+\\.config\\.ts$" },
      to: { pathNot: ["^src/contexts/$1/domain/", "^src/shared/"] },
    },
    {
      name: "shared-kernel-is-a-leaf",
      comment: "src/shared depends on nothing but itself (and vitest in tests).",
      severity: "error",
      from: { path: "^src/shared/" },
      to: { pathNot: ["^src/shared/", VITEST] },
    },

    // ── Rule 2: application never imports infrastructure ─────────────────
    {
      name: "application-not-to-infrastructure",
      comment: "§2.3.2 — application/ never imports any infrastructure/.",
      severity: "error",
      from: { path: "^src/contexts/[^/]+/application/" },
      to: { path: "^src/contexts/[^/]+/infrastructure/" },
    },
    {
      name: "application-not-to-engines",
      comment: "§2.3.2 — application/ orchestrates domain objects; engines stay in adapters.",
      severity: "error",
      from: { path: "^src/contexts/[^/]+/application/" },
      to: { path: ENGINES },
    },

    // ── Rule 5: cross-context access only through index.ts ────────────────
    {
      name: "cross-context-only-via-index",
      comment: "§2.3.5 — a context imports another context only through its index.ts.",
      severity: "error",
      from: { path: "^src/contexts/([^/]+)/" },
      to: {
        path: "^src/contexts/",
        pathNot: ["^src/contexts/$1/", "^src/contexts/[^/]+/index\\.ts$"],
      },
    },
    {
      name: "outside-contexts-only-via-index",
      comment:
        "§2.3.4/5 — shared, presentation and main see contexts only through index.ts " +
        "(which never exports infrastructure).",
      severity: "error",
      from: { path: ["^src/shared/", "^src/presentation/", "^src/main\\.ts$"] },
      to: { path: "^src/contexts/", pathNot: "^src/contexts/[^/]+/index\\.ts$" },
    },
    {
      name: "game-uses-index-for-domain-and-application",
      comment:
        "The composition root imports concrete infrastructure directly, but domain, " +
        "application and config through the context's index.ts.",
      severity: "error",
      from: { path: "^src/game/" },
      to: {
        path: [
          "^src/contexts/[^/]+/(domain|application)/",
          "^src/contexts/[^/]+/[^/]+\\.config\\.ts$",
        ],
      },
    },
    {
      name: "index-does-not-export-infrastructure",
      comment: "index.ts is the public API; concrete adapters are only reachable from src/game.",
      severity: "error",
      from: { path: "^src/contexts/[^/]+/index\\.ts$" },
      to: { path: "^src/contexts/[^/]+/infrastructure/" },
    },

    // ── Rule 6: only src/game knows concrete infrastructure ───────────────
    {
      name: "only-game-imports-infrastructure",
      comment: "§2.3.6 — only the composition root (src/game) wires concrete adapters.",
      severity: "error",
      from: { pathNot: ["^src/game/", "^src/contexts/"] },
      to: { path: "^src/contexts/[^/]+/infrastructure/" },
    },
    {
      name: "contexts-not-to-outer-layers",
      comment: "Contexts never depend on presentation or the composition root.",
      severity: "error",
      from: { path: "^src/contexts/" },
      to: { path: ["^src/presentation/", "^src/game/", "^src/main\\.ts$"] },
    },

    // ── Art: the deck's penguin is the board's decal only ────────────────
    {
      name: "deck-art-only-on-the-board",
      comment:
        "STYLE.md: the deck's penguin art (deck-penguin.jpg) is used ONLY as the deck " +
        "decal, by board-mesh.ts: never on a banner, a graffiti piece or anything else.",
      severity: "error",
      from: { pathNot: "^src/presentation/scene/board-mesh\\.ts$" },
      to: { path: "^src/presentation/assets/deck-penguin\\.jpg$" },
    },

    // ── Rule 4: presentation reads snapshots, never physics ───────────────
    {
      name: "presentation-not-to-game",
      comment: "§2.3.4 — presentation receives read models; it does not reach back into the loop.",
      severity: "error",
      from: { path: "^src/presentation/" },
      to: { path: ["^src/game/", "^src/main\\.ts$"] },
    },
    {
      name: "rapier-only-in-board-infrastructure",
      comment: "§2.3 physics port — only board/infrastructure touches Rapier.",
      severity: "error",
      from: { pathNot: "^src/contexts/board/infrastructure/" },
      to: { path: NPM("@dimforge/[^/]+") },
    },
    {
      name: "three-only-in-presentation",
      comment: "Three.js is a rendering concern.",
      severity: "error",
      from: { pathNot: "^src/presentation/" },
      to: { path: NPM("three", "@types/three") },
    },
    {
      name: "lil-gui-only-in-presentation-or-game",
      comment: "The dev tuning panel is a UI concern, wired by the game in dev builds.",
      severity: "error",
      from: { pathNot: ["^src/presentation/", "^src/game/"] },
      to: { path: NPM("lil-gui") },
    },
    {
      name: "main-only-boots-game",
      comment: "src/main.ts only boots the composition root.",
      severity: "error",
      from: { path: "^src/main\\.ts$" },
      to: { pathNot: "^src/game/" },
    },

    // ── Maps (GAME.md "Maps", ADR 0014) ───────────────────────────────────
    {
      name: "maps-are-data",
      comment:
        "A map folder (src/maps/<id>/) builds its level from the world context's public API " +
        "and the shared kernel, and imports nothing from other map folders.",
      severity: "error",
      from: { path: "^src/maps/([^/]+)/", pathNot: TEST_FILE },
      to: {
        pathNot: ["^src/maps/$1/", "^src/contexts/world/index\\.ts$", "^src/shared/"],
      },
    },
    {
      name: "only-game-finds-maps",
      comment: "Only the composition root (src/game) discovers and loads maps.",
      severity: "error",
      from: { pathNot: ["^src/game/", "^src/maps/"] },
      to: { path: "^src/maps/" },
    },

    // ── General hygiene ───────────────────────────────────────────────────
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "not-to-unresolvable",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    includeOnly: ["^src/", "node_modules"],
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      mainFields: ["module", "main", "types", "typings"],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
