import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import readline from "node:readline";
import { Writable } from "node:stream";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
export function httpsOrigin(input) {
  const url = new URL(input);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    !/^[-a-z0-9]+\.(?:ngrok-free\.(?:app|dev)|ngrok\.app|ngrok\.dev)$/.test(
      url.hostname,
    )
  )
    throw new Error("Use your account’s assigned HTTPS ngrok dev domain.");
  return url.origin;
}
export function updateMobileEnvironment(text, api, web) {
  const lines = text
    .split(/\r?\n/)
    .filter((line) => !/^EXPO_PUBLIC_(?:API|WEB)_URL=/.test(line));
  return (
    lines.join("\n").trimEnd() +
    `\nEXPO_PUBLIC_API_URL=${api}\nEXPO_PUBLIC_WEB_URL=${web}\n`
  );
}
function privateWrite(file, content) {
  execFileSync("git", ["check-ignore", "-q", path.relative(root, file)], {
    cwd: root,
    stdio: "ignore",
  });
  fs.writeFileSync(file, content, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}
async function credential(config) {
  if (
    fs.existsSync(config) &&
    /authtoken:\s*\S+/.test(fs.readFileSync(config, "utf8"))
  )
    return;
  if (!process.stdin.isTTY)
    throw new Error(
      "Connect ngrok first by running this script in Terminal with --setup.",
    );
  process.stdout.write(
    "\nPaste your ngrok authtoken here, then press Enter. It will not be displayed or saved in shell history.\nToken: ",
  );
  const output = new Writable({
      write(_chunk, _encoding, done) {
        done();
      },
    }),
    input = readline.createInterface({
      input: process.stdin,
      output,
      terminal: true,
      historySize: 0,
    });
  let token = await new Promise((resolve) => input.question("", resolve));
  input.close();
  token = token.trim();
  if (!/^[A-Za-z0-9_-]{20,300}$/.test(token))
    throw new Error(
      "That was not an ngrok authtoken. Copy it from Your Authtoken in the ngrok dashboard.",
    );
  privateWrite(
    config,
    `version: "3"\nagent:\n  authtoken: ${JSON.stringify(token)}\n  web_addr: 127.0.0.1:4041\n`,
  );
  token = "";
  console.log(
    "\nNgrok credential saved privately for Circle.social (permissions 600).",
  );
}
async function unused(port, host) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", () =>
      reject(
        new Error(
          `Port ${port} is already in use. Existing services were not stopped.`,
        ),
      ),
    );
    server.listen(port, host, () => server.close(resolve));
  });
}
export async function main(args = process.argv.slice(2)) {
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i === -1 ? undefined : args[i + 1];
  };
  const origin = httpsOrigin(
      get("--origin") ?? process.env.CIRCLE_MOBILE_HTTPS_ORIGIN ?? "",
    ),
    rp = new URL(origin).hostname;
  const addresses = Object.entries(os.networkInterfaces())
    .flatMap(([name, list]) => (list ?? []).map((item) => ({ ...item, name })))
    .filter(
      (item) =>
        item.family === "IPv4" &&
        !item.internal &&
        /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(item.address),
    );
  const ip =
    get("--ip") ??
    addresses.find((x) => x.name === "en0")?.address ??
    addresses[0]?.address;
  if (!ip || !addresses.some((x) => x.address === ip))
    throw new Error(
      "Connect the Mac and phone to the same local network first.",
    );
  const device = get("--device");
  if (device && !/^[A-Fa-f0-9-]{20,40}$/.test(device))
    throw new Error("Invalid iPhone device identifier.");
  const api = `http://${ip}:3002`,
    config = path.join(root, "infrastructure/.env.ngrok.yml"),
    ngrok = path.join(os.homedir(), ".local/bin/ngrok");
  console.log(
    `Circle.social phone sign-in: ${origin}\nPhone backend: ${api}\nExisting localhost services and passkeys are preserved.`,
  );
  if (args.includes("--check")) return;
  if (args.includes("--setup-only")) {
    await credential(config);
    console.log(
      "Connection saved. Return to the chat; I will finish starting the app.",
    );
    return;
  }
  if (!fs.existsSync(ngrok))
    throw new Error("The ngrok agent is not installed.");
  if (args.includes("--setup")) await credential(config);
  if (!fs.existsSync(config))
    throw new Error(
      "Run once in Terminal with --setup to connect your ngrok account privately.",
    );
  for (const [port, host] of [
    [3002, "0.0.0.0"],
    [3203, "127.0.0.1"],
    [4041, "127.0.0.1"],
    [8084, "0.0.0.0"],
  ])
    await unused(port, host);
  const children = new Set(),
    logDir = path.join(os.tmpdir(), "circle-mobile-https");
  fs.mkdirSync(logDir, { recursive: true, mode: 0o700 });
  let stopping = false;
  function launch(name, cmd, argv, env = {}) {
    const file = path.join(logDir, name + ".log"),
      fd = fs.openSync(file, "w", 0o600);
    const child = spawn(cmd, argv, {
      cwd: root,
      env: { ...process.env, ...env },
      detached: true,
      stdio: ["ignore", fd, fd],
    });
    fs.closeSync(fd);
    children.add(child);
    child.once("error", () => {
      console.error(`${name} could not start. See ${file}`);
      stop(1);
    });
    child.once("exit", (code) => {
      children.delete(child);
      if (!stopping) {
        console.error(`${name} stopped (exit ${code}). See ${file}`);
        stop(code || 1);
      }
    });
    return child;
  }
  function stop(code = 0) {
    if (stopping) return;
    stopping = true;
    for (const c of children)
      try {
        process.kill(-c.pid, "SIGTERM");
      } catch {}
    process.exitCode = code;
  }
  process.once("SIGINT", () => stop());
  process.once("SIGTERM", () => stop());
  async function runBuild() {
    console.log("Building the current workspace…");
    const c = launch("build", "pnpm", ["build"]);
    await new Promise((resolve, reject) => {
      c.removeAllListeners("exit");
      c.once("exit", (code) => {
        children.delete(c);
        if (code === 0) resolve();
        else
          reject(
            new Error("Build failed. See " + path.join(logDir, "build.log")),
          );
      });
    });
  }
  async function ready(url, init = {}, timeout = 60000) {
    const started = Date.now();
    while (Date.now() - started < timeout && !stopping) {
      try {
        const res = await fetch(url, {
          ...init,
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) return res;
      } catch {}
      await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error(
      "Could not reach " + url + ". Check the private logs in " + logDir,
    );
  }
  try {
    if (!args.includes("--no-build")) await runBuild();
    launch("api", "pnpm", ["--filter", "api", "exec", "node", "dist/main.js"], {
      NODE_ENV: "development",
      HOST: "0.0.0.0",
      PORT: "3002",
      WEB_ORIGIN: origin,
      WEBAUTHN_RP_ID: rp,
      LOG_LEVEL: "warn",
    });
    await ready("http://127.0.0.1:3002/v1/health/live");
    launch(
      "web",
      "pnpm",
      [
        "--filter",
        "web",
        "exec",
        "next",
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        "3203",
      ],
      { CIRCLE_API_URL: "http://127.0.0.1:3002", CIRCLE_WEB_ORIGIN: origin },
    );
    await ready("http://127.0.0.1:3203/");
    const response = await ready(
      "http://127.0.0.1:3203/api/v1/auth/registration/options",
      {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: "{}",
      },
    );
    if (
      (await response.json()).data?.rp?.id !== rp ||
      !response.headers.getSetCookie().some((c) => /; secure(?:;|$)/i.test(c))
    )
      throw new Error(
        "Passkey domain or secure cookie verification failed. No tunnel was started.",
      );
    launch("ngrok", ngrok, [
      "http",
      "http://127.0.0.1:3203",
      "--config",
      config,
      "--url",
      origin,
      "--inspect=false",
      "--log",
      "stdout",
      "--log-format",
      "json",
    ]);
    await ready(
      origin,
      { headers: { "ngrok-skip-browser-warning": "true" } },
      90000,
    );
    const envFile = path.join(root, "apps/mobile/.env.local"),
      old = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "";
    const backup = path.join(root, "apps/mobile/.env.before-https");
    if (!fs.existsSync(backup)) privateWrite(backup, old);
    privateWrite(envFile, updateMobileEnvironment(old, api, origin));
    console.log(
      `\nHTTPS sign-in is ready: ${origin}\nThe phone now uses ${api} and the correct passkey domain.\nKeep this Terminal open. Stop with Control+C. Logs: ${logDir}`,
    );
    const mobileEnv = { EXPO_PUBLIC_API_URL: api, EXPO_PUBLIC_WEB_URL: origin };
    if (device) {
      const mise = path.join(os.homedir(), ".local/bin/mise");
      launch(
        "iphone",
        mise,
        [
          "exec",
          "ruby@3.4.12",
          "--",
          "pnpm",
          "--filter",
          "mobile",
          "exec",
          "expo",
          "run:ios",
          "--device",
          device,
          "--port",
          "8084",
        ],
        mobileEnv,
      );
    } else
      launch(
        "metro",
        "pnpm",
        [
          "--filter",
          "mobile",
          "exec",
          "expo",
          "start",
          "--dev-client",
          "--port",
          "8084",
          "--lan",
        ],
        mobileEnv,
      );
  } catch (error) {
    stop(1);
    throw error;
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
