// Nightly database snapshots with rotation: 14 daily + 8 weekly (Sundays), plus manual ones.
import { mkdirSync, readdirSync, statSync, unlinkSync, existsSync, chmodSync } from "node:fs";
import { join } from "node:path";

const DAILY = /^sketchboard-(\d{4}-\d{2}-\d{2})\.db$/;
const MANUAL = /^sketchboard-manual-[\dT-]+\.db$/;
const KEEP_DAILY = 14;
const KEEP_WEEKLY = 8;
const KEEP_MANUAL = 10;
const CHECK_EVERY = 60 * 60 * 1000;

// Local calendar date, so "today's backup" matches the user's day.
const day = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function createBackups(db, dir, log = console) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });

  function snapshot(file) {
    const target = join(dir, file);
    if (existsSync(target)) unlinkSync(target);
    // VACUUM INTO writes a consistent, compacted copy even while the app is in use.
    db.prepare("VACUUM INTO ?").run(target);
    chmodSync(target, 0o600);
    return target;
  }

  function rotate() {
    const files = readdirSync(dir);
    const daily = files.filter((f) => DAILY.test(f)).sort().reverse();
    const keep = new Set(daily.slice(0, KEEP_DAILY));
    const sundays = daily.filter((f) => new Date(`${DAILY.exec(f)[1]}T12:00:00Z`).getUTCDay() === 0);
    for (const f of sundays.slice(0, KEEP_WEEKLY)) keep.add(f);
    for (const f of daily) if (!keep.has(f)) unlinkSync(join(dir, f));
    const manual = files.filter((f) => MANUAL.test(f)).sort().reverse();
    for (const f of manual.slice(KEEP_MANUAL)) unlinkSync(join(dir, f));
  }

  function daily(now = new Date()) {
    const file = `sketchboard-${day(now)}.db`;
    if (existsSync(join(dir, file))) return null;
    const path = snapshot(file);
    rotate();
    log.log(`sketchboard: backup written to ${path}`);
    return path;
  }

  function manual() {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const path = snapshot(`sketchboard-manual-${stamp}.db`);
    rotate();
    return path;
  }

  function list() {
    return readdirSync(dir)
      .filter((f) => DAILY.test(f) || MANUAL.test(f))
      .map((f) => {
        const st = statSync(join(dir, f));
        return { name: f, size: st.size, created: Math.floor(st.mtimeMs), manual: MANUAL.test(f) };
      })
      .sort((a, b) => b.created - a.created);
  }

  function start() {
    const tick = () => {
      try {
        daily();
      } catch (err) {
        log.error("sketchboard: backup failed:", err.message);
      }
    };
    tick();
    setInterval(tick, CHECK_EVERY).unref();
  }

  return { dir, daily, manual, list, start, rotate };
}
