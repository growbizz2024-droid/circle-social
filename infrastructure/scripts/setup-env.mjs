import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
function privateFile(file, content) {
  execFileSync("git", ["check-ignore", "-q", file]);
  if (fs.existsSync(file)) {
    console.log(`${file}: retained`);
    return;
  }
  fs.writeFileSync(file, content, { mode: 0o600, flag: "wx" });
  console.log(`${file}: created (600)`);
}
fs.mkdirSync("infrastructure/docker", { recursive: true });
privateFile(
  "infrastructure/docker/.env",
  `POSTGRES_DB=circle_social
POSTGRES_USER=circle_admin
POSTGRES_PASSWORD=${randomBytes(32).toString("hex")}
REDIS_PASSWORD=${randomBytes(32).toString("hex")}
`,
);
const values = Object.fromEntries(
  fs
    .readFileSync("infrastructure/docker/.env", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
for (const key of [
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "POSTGRES_DB",
  "REDIS_PASSWORD",
])
  if (!values[key]) throw new Error(`Missing ${key}`);
const db = `postgresql://${encodeURIComponent(values.POSTGRES_USER)}:${encodeURIComponent(values.POSTGRES_PASSWORD)}@127.0.0.1:5433/${encodeURIComponent(values.POSTGRES_DB)}?schema=public`;
const redis = `redis://:${encodeURIComponent(values.REDIS_PASSWORD)}@127.0.0.1:6380/0`;
privateFile(
  "apps/api/.env",
  `DATABASE_URL="${db}"
REDIS_URL="${redis}"
HOST=127.0.0.1
PORT=3001
WEB_ORIGIN=http://localhost:3000
WEBAUTHN_RP_ID=localhost
`,
);
privateFile(
  "apps/api/.env.test",
  `DATABASE_URL="${db.replace("/circle_social?", "/circle_social_test?")}"
REDIS_URL="${redis.replace("/0", "/1")}"
NODE_ENV=test
AUTH_RATE_LIMIT=200
LOG_LEVEL=silent
WEB_ORIGIN=http://localhost:3000
WEBAUTHN_RP_ID=localhost
`,
);
privateFile(
  "apps/worker/.env",
  `REDIS_URL="${redis}"
`,
);
privateFile(
  "infrastructure/docker/.env.monitoring",
  `GRAFANA_ADMIN_PASSWORD=${randomBytes(32).toString("hex")}\n`,
);
console.log("Environment setup complete. Credentials were not displayed.");
