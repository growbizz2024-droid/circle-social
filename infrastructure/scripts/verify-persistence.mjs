import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
const compose = [
  "compose",
  "--env-file",
  "infrastructure/docker/.env",
  "-f",
  "infrastructure/docker/docker-compose.yml",
];
const run = (args) => execFileSync("docker", args, { encoding: "utf8" }).trim();
const originals = run([
  "inspect",
  "ads_postgres",
  "ads_redis",
  "--format",
  "{{.Name}} {{.State.StartedAt}}",
]);
const suffix = randomUUID().replaceAll("-", "");
const table = `circle_probe_${suffix}`;
const key = `circle:persistence:${suffix}`;
const sql = (statement) =>
  run([
    ...compose,
    "exec",
    "-T",
    "postgres",
    "sh",
    "-c",
    'psql -U "$POSTGRES_USER" -d circle_social_test -tAc "$1"',
    "sh",
    statement,
  ]);
const redis = (command) =>
  run([
    ...compose,
    "exec",
    "-T",
    "redis",
    "sh",
    "-c",
    'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli "$@"',
    "sh",
    ...command,
  ]);
try {
  sql(
    `CREATE TABLE ${table} (marker integer); INSERT INTO ${table} VALUES (1)`,
  );
  redis(["SET", key, "persisted"]);
  run([...compose, "down"]);
  run([...compose, "up", "-d", "--wait", "--wait-timeout", "60"]);
  if (
    sql(`SELECT marker FROM ${table}`) !== "1" ||
    redis(["GET", key]) !== "persisted"
  )
    throw new Error("Circle.social persistence probe failed");
  if (
    originals !==
    run([
      "inspect",
      "ads_postgres",
      "ads_redis",
      "--format",
      "{{.Name}} {{.State.StartedAt}}",
    ])
  )
    throw new Error("Original containers changed unexpectedly");
  console.log("PostgreSQL persistence: PASS");
  console.log("Redis persistence: PASS");
  console.log("Circle.social shutdown/startup: PASS");
  console.log("Original container start times unchanged: PASS");
} finally {
  sql(`DROP TABLE IF EXISTS ${table}`);
  redis(["DEL", key]);
}
