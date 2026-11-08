// video.json + narration.wav -> video.mp4, by drawing every frame in the sketchboard player.
//
//   node videogen/render.mjs videogen/out/rat-race [--seconds 10]
//
// Starts sketchboard's Vite dev server on PORT, loads player.html in headless Chromium, asks it for each
// frame as a JPEG and pipes those straight into ffmpeg together with the narration.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";

const PORT = 5199;
const dir = resolve(process.argv[2]);
const limit = process.argv.includes("--seconds") ? Number(process.argv[process.argv.indexOf("--seconds") + 1]) : Infinity;
const app = resolve(import.meta.dirname, "../sketchboard");
const video = JSON.parse(readFileSync(join(dir, "video.json"), "utf8"));
const duration = Math.min(video.duration, limit);
const frames = Math.ceil(duration * video.fps);

const vite = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { cwd: app, stdio: "ignore" });
let viteExit = null;
vite.on("exit", (code) => (viteExit = code));
for (let up = false; !up; await new Promise((r) => setTimeout(r, 200))) {
  if (viteExit !== null) throw new Error(`vite exited with ${viteExit} (is port ${PORT} taken?)`);
  up = await fetch(`http://localhost:${PORT}/player.html`).then((r) => r.ok, () => false);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
  page.on("pageerror", (e) => console.error("player:", e.message));
  await page.goto(`http://localhost:${PORT}/player.html`);
  // Vite may reload the page once after optimising dependencies (first run after a code change): retry.
  for (let attempt = 1; ; attempt++) {
    try {
      await page.waitForFunction(() => "__load" in window);
      await page.evaluate((v) => window.__load(v), video);
      break;
    } catch (e) {
      if (attempt === 3 || !/context was destroyed|navigation/i.test(e.message)) throw e;
      await page.waitForLoadState("load");
    }
  }

  const ffmpeg = spawn("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "image2pipe", "-framerate", String(video.fps), "-c:v", "mjpeg", "-i", "-",
    "-i", join(dir, "narration.wav"),
    "-t", String(duration),
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
    join(dir, "video.mp4"),
  ], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((ok, fail) => ffmpeg.on("exit", (c) => (c === 0 ? ok() : fail(new Error(`ffmpeg exited with ${c}`)))));

  const started = Date.now();
  for (let f = 0; f < frames; f++) {
    const url = await page.evaluate((t) => window.__frame(t), f / video.fps);
    // Respect ffmpeg's pace so a slow encoder doesn't make us buffer the whole video in memory.
    if (!ffmpeg.stdin.write(Buffer.from(url.slice(url.indexOf(",") + 1), "base64"))) await new Promise((r) => ffmpeg.stdin.once("drain", r));
    if (f % 150 === 0) process.stderr.write(`\r${f}/${frames} frames`);
  }
  ffmpeg.stdin.end();
  await done;
  console.error(`\r${frames} frames in ${((Date.now() - started) / 1000).toFixed(0)}s -> ${join(dir, "video.mp4")}`);
} finally {
  await browser.close();
  vite.kill();
}
