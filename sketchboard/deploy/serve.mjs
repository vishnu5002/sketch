// Entry point for the local service (production and the dev API).
//   PORT              port to serve on (default 5183)
//   HOST              bind a single address instead of both loopbacks
//   SKETCHBOARD_DATA  data folder (default ~/.local/share/sketchboard)
//   DIST              built app to serve; API_ONLY=1 serves only /api (dev)
//   EXTRA_PORTS       comma-separated ports also allowed as Host/Origin (the Vite dev server)
//   BACKUPS=0         disable nightly backups
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "../server/app.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 5183);
const dataDir = resolve(process.env.SKETCHBOARD_DATA || join(homedir(), ".local", "share", "sketchboard"));

try {
  const app = await startServer({
    port,
    hosts: process.env.HOST ? [process.env.HOST] : undefined,
    dataDir,
    dist: process.env.API_ONLY === "1" ? null : resolve(process.env.DIST || join(here, "..", "dist")),
    extraPorts: (process.env.EXTRA_PORTS || "").split(",").map(Number).filter(Boolean),
    backups: process.env.BACKUPS !== "0",
  });
  console.log(`sketchboard: http://localhost:${port} · data in ${app.dbPath}`);
  for (const sig of ["SIGTERM", "SIGINT"]) {
    process.on(sig, () => {
      setTimeout(() => process.exit(0), 3000).unref();
      app.close().finally(() => process.exit(0));
    });
  }
} catch (err) {
  console.error(`sketchboard: ${err.message}`);
  process.exit(1);
}
