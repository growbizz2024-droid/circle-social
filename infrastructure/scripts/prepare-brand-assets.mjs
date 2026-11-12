// Chillax permits app embedding but not redistribution through a font repository.
// Obtain these private build assets directly from Fontshare, once per checkout.
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
const fonts = [
  [
    "Chillax-Variable.woff2",
    "Chillax_Complete/Fonts/WEB/fonts/Chillax-Variable.woff2",
    "4554fa2df4959226daea1f25a22cd54a7e5d2539e59769d0071547713d416106",
  ],
  [
    "Chillax-Semibold.otf",
    "Chillax_Complete/Fonts/OTF/Chillax-Semibold.otf",
    "6efe8d9ef5eeb7aaa28a8387b8f808fcde29c7f3406bc7fd64e3ef42f39774d9",
  ],
];
const directory = new URL("../../assets/brand/fonts/", import.meta.url);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
let ready = !process.argv.includes("--verify-download");
for (const [name, , expected] of fonts) {
  try {
    if (hash(await fs.readFile(new URL(name, directory))) !== expected)
      ready = false;
  } catch {
    ready = false;
  }
}
if (!ready && process.argv.includes("--offline"))
  throw new Error(
    "Local brand fonts are missing or changed. Run pnpm brand:assets during setup before building.",
  );
if (!ready) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "circle-fonts-"));
  try {
    const response = await fetch(
      "https://api.fontshare.com/v2/fonts/download/chillax",
      { signal: AbortSignal.timeout(60000) },
    );
    if (!response.ok)
      throw new Error(`Fontshare download failed (${response.status})`);
    const archive = path.join(temp, "chillax.zip");
    await fs.writeFile(archive, Buffer.from(await response.arrayBuffer()));
    await fs.mkdir(directory, { recursive: true });
    for (const [name, entry, expected] of fonts) {
      const bytes = execFileSync("unzip", ["-p", archive, entry], {
        maxBuffer: 1024 * 1024,
      });
      if (hash(bytes) !== expected)
        throw new Error(
          "Chillax asset changed upstream; review its version and license before updating.",
        );
      await fs.writeFile(new URL(name, directory), bytes);
    }
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}
console.log(
  "Local brand fonts ready (verified; no runtime font service required).",
);
