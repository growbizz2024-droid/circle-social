// Download public database assets only. No user IPs or credentials are sent.
import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
const root = new URL("../../", import.meta.url);
const month = process.argv[2] ?? new Date().toISOString().slice(0, 7);
if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))
  throw new Error("Use a YYYY-MM database release");
const directory = new URL("infrastructure/geoip/", root),
  destination = new URL("dbip-city-lite.mmdb", directory),
  temporary = new URL("dbip-city-lite.mmdb.partial", directory);
await fs.mkdir(directory, { recursive: true });
const url = `https://download.db-ip.com/free/dbip-city-lite-${month}.mmdb.gz`;
const hash = createHash("sha256");
let bytes = 0;
try {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(180000),
    redirect: "error",
  });
  if (!response.ok || !response.body)
    throw new Error(`Database download failed (${response.status})`);
  await pipeline(
    Readable.fromWeb(response.body),
    createGunzip(),
    new Transform({
      transform(chunk, encoding, done) {
        bytes += chunk.length;
        if (bytes > 512 * 1024 * 1024) {
          done(new Error("Database exceeds the download size limit"));
          return;
        }
        hash.update(chunk);
        done(null, chunk);
      },
    }),
    createWriteStream(temporary, { mode: 0o600 }),
  );
  const require = createRequire(new URL("apps/api/package.json", root));
  const { open } = require("maxmind");
  const { fileURLToPath } = await import("node:url");
  await open(fileURLToPath(temporary));
  await fs.rename(temporary, destination);
  await fs.writeFile(
    new URL("dbip-city-lite.metadata.json", directory),
    JSON.stringify(
      {
        provider: "DB-IP Lite",
        release: month,
        url,
        sha256: hash.digest("hex"),
        bytes,
        downloadedAt: new Date().toISOString(),
        license: "CC BY 4.0",
        attribution: "https://db-ip.com",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `Installed DB-IP City Lite ${month} (${Math.round(bytes / 1024 / 1024)} MiB). No login IPs sent for lookup.`,
  );
} catch (e) {
  await fs.rm(temporary, { force: true });
  throw e;
}
