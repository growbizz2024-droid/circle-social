import fs from "node:fs";
import { execFileSync } from "node:child_process";
const files = [
  ...new Set(
    execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      { encoding: "utf8" },
    )
      .split("\0")
      .filter(Boolean),
  ),
];
const secrets = [];
for (const file of [
  "infrastructure/docker/.env",
  "infrastructure/docker/.env.monitoring",
  "apps/api/.env",
  "apps/worker/.env",
])
  if (fs.existsSync(file))
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const match = line.match(/(?:PASSWORD=)([a-f0-9]{64})/);
      if (match) secrets.push(match[1]);
    }
const failures = [];
for (const file of files) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
  if (/(^|\/)\.env(?:\.|$)/.test(file) && !file.endsWith(".env.example")) {
    failures.push(file);
    continue;
  }
  const content = fs.readFileSync(file);
  if (content.includes(0)) continue;
  const text = content.toString("utf8");
  if (
    secrets.some((s) => text.includes(s)) ||
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text) ||
    /gh[pousr]_[A-Za-z0-9]{30,}/.test(text) ||
    /github_pat_[A-Za-z0-9_]{40,}/.test(text)
  )
    failures.push(file);
}
if (failures.length) {
  console.error(
    "Secret scan failed; inspect these files privately:",
    [...new Set(failures)].join(", "),
  );
  process.exitCode = 1;
} else console.log(`Secret scan passed (${files.length} source files).`);
