// Dev-server endpoints for the montage recorder (src/game/montage/montage-player.ts).
// Files land in MONTAGE_OUT_DIR (default: ./recordings, git-ignored).
//   GET  /__montage/ping                         → { ok, ffmpeg }
//   POST /__montage/save?name=<file>             body = file   → { path }
//   POST /__montage/frame?session=<id>&index=<n> body = PNG    → { ok }
//   POST /__montage/finish?session=<id>&name=<file.webm>&fps=<n>
//        encodes the session's frames with ffmpeg (VP9 WebM), deletes them → { path }
// The frame endpoints are the deterministic recorder that does not depend on the browser's
// encoders (which a minimized window throttles to about one frame per second).
// Plain .mjs so it can use Node APIs without Node types in the TypeScript project.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

function clean(name, fallback) {
  return basename(name ?? fallback).replace(/[^\w.-]/g, "_");
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolveBody(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function hasFfmpeg() {
  try {
    return spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
  } catch {
    return false;
  }
}

function encode(framesDir, out, fps) {
  const args = [
    "-y",
    "-loglevel",
    "error",
    "-framerate",
    String(fps),
    "-i",
    join(framesDir, "%06d.png"),
    "-c:v",
    "libvpx-vp9",
    "-pix_fmt",
    "yuv420p",
    "-b:v",
    "0",
    "-crf",
    "28",
    "-row-mt",
    "1",
    "-deadline",
    "good",
    "-cpu-used",
    "3",
    out,
  ];
  return new Promise((resolveEncode, reject) => {
    const ffmpeg = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let errors = "";
    ffmpeg.stderr.on("data", (d) => {
      errors += d;
    });
    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code) =>
      code === 0 ? resolveEncode() : reject(new Error(`ffmpeg exited ${code}: ${errors}`)),
    );
  });
}

export function montageSavePlugin() {
  return {
    name: "skate-montage-save",
    apply: "serve",
    configureServer(server) {
      const outDir = resolve(
        process.env.MONTAGE_OUT_DIR ?? resolve(server.config.root, "recordings"),
      );
      const framesDir = (session) => join(outDir, `.frames-${clean(session, "session")}`);
      const ffmpeg = hasFfmpeg();

      server.middlewares.use("/__montage", async (req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const q = url.searchParams;
        try {
          if (url.pathname === "/ping") {
            json(res, 200, { ok: true, ffmpeg });
            return;
          }
          if (req.method !== "POST") {
            json(res, 405, { error: "POST only" });
            return;
          }
          if (url.pathname === "/save") {
            mkdirSync(outDir, { recursive: true });
            const path = join(outDir, clean(q.get("name"), "recording.bin"));
            writeFileSync(path, await readBody(req));
            json(res, 200, { path });
            return;
          }
          if (url.pathname === "/frame") {
            const dir = framesDir(q.get("session"));
            mkdirSync(dir, { recursive: true });
            const index = Number.parseInt(q.get("index") ?? "0", 10);
            writeFileSync(join(dir, `${String(index).padStart(6, "0")}.png`), await readBody(req));
            json(res, 200, { ok: true });
            return;
          }
          if (url.pathname === "/finish") {
            const dir = framesDir(q.get("session"));
            const path = join(outDir, clean(q.get("name"), "montage.webm"));
            await encode(dir, path, Number.parseInt(q.get("fps") ?? "60", 10));
            rmSync(dir, { recursive: true, force: true });
            json(res, 200, { path });
            return;
          }
          json(res, 404, { error: "unknown montage endpoint" });
        } catch (error) {
          json(res, 500, { error: String(error) });
        }
      });
    },
  };
}
