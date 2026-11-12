// Private loopback-only setup form. No credential is logged or placed in a command line.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  ),
  file = path.join(root, "infrastructure/.env.ngrok.yml"),
  origin = "http://127.0.0.1:3215",
  nonce = randomBytes(32).toString("hex");
execFileSync("git", ["check-ignore", "-q", path.relative(root, file)], {
  cwd: root,
  stdio: "ignore",
});
const headers = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};
const page = (content) =>
  `<!doctype html><html lang="en"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Connect Circle.social</title><style>body{background:#0b0b0b;color:#fff;font:17px system-ui;margin:0;min-height:100vh;display:grid;place-items:center}main{max-width:470px;padding:36px;background:#1a1a1a;border:1px solid #444;border-radius:22px;margin:18px}h1{font-size:30px;margin:12px 0}p{line-height:1.6;color:#ccc}small{color:#bbb}input{box-sizing:border-box;width:100%;padding:14px;color:#fff;background:#111;border:1px solid #888;border-radius:10px;margin:12px 0;font-size:18px}button{width:100%;padding:15px;border:0;background:#ff6a00;color:#0b0b0b;font-weight:700;font-size:17px;border-radius:10px;cursor:pointer}.brand{color:#ff8e3e;font-weight:700;letter-spacing:2px;font-size:12px}</style><main><div class="brand">CIRCLE.SOCIAL</div>${content}</main></html>`;
const server = http.createServer(async (req, res) => {
  if (req.headers.host !== "127.0.0.1:3215") {
    res.writeHead(403).end();
    return;
  }
  if (req.method === "GET" && req.url === "/") {
    const exists =
      fs.existsSync(file) &&
      /authtoken:\s*\S+/.test(fs.readFileSync(file, "utf8"));
    res.writeHead(200, {
      ...headers,
      "Set-Cookie": `circle_setup=${nonce}; HttpOnly; SameSite=Strict; Path=/; Max-Age=900`,
    });
    res.end(
      page(
        exists
          ? "<h1>Connection saved.</h1><p>Return to the chat. Your ngrok token is configured privately.</p>"
          : `<h1>One last connection.</h1><p>Copy your authtoken from the ngrok tab. Paste it below, then click <b>Connect ngrok</b>.</p><form method="post" action="/connect"><input type="hidden" name="nonce" value="${nonce}"><label for="token">Ngrok authtoken</label><input id="token" name="token" type="password" autocomplete="off" spellcheck="false" minlength="20" maxlength="300" required autofocus><button>Connect ngrok</button></form><p><small>This form runs only on your Mac. The token is saved in an ignored file with private permissions. It is never shown in chat or shell history.</small></p>`,
      ),
    );
    return;
  }
  if (
    req.method !== "POST" ||
    req.url !== "/connect" ||
    req.headers.origin !== origin ||
    !(req.headers.cookie ?? "")
      .split(";")
      .some((x) => x.trim() === `circle_setup=${nonce}`) ||
    !String(req.headers["content-type"]).startsWith(
      "application/x-www-form-urlencoded",
    )
  ) {
    res.writeHead(403).end();
    return;
  }
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > 4096) {
      res.writeHead(413).end();
      return;
    }
  }
  const data = new URLSearchParams(body),
    supplied = Buffer.from(data.get("nonce") ?? ""),
    expected = Buffer.from(nonce);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    res.writeHead(403).end();
    return;
  }
  const token = (data.get("token") ?? "").trim();
  if (!/^[A-Za-z0-9_-]{20,300}$/.test(token)) {
    res
      .writeHead(400, headers)
      .end(
        page(
          "<h1>Try copying again.</h1><p>Please copy the authtoken from ngrok, then go back and paste it again.</p>",
        ),
      );
    return;
  }
  try {
    fs.writeFileSync(
      file,
      `version: "3"\nagent:\n  authtoken: ${JSON.stringify(token)}\n  web_addr: 127.0.0.1:4041\n`,
      { mode: 0o600, flag: "wx" },
    );
    fs.chmodSync(file, 0o600);
  } catch (error) {
    if (error.code !== "EEXIST") {
      res
        .writeHead(500, headers)
        .end(
          page(
            "<h1>Connection could not be saved.</h1><p>Return to the chat for help.</p>",
          ),
        );
      return;
    }
  }
  body = "";
  res
    .writeHead(200, headers)
    .end(
      page(
        "<h1>Connected.</h1><p>Your ngrok token is saved privately. Return to the chat—I can now finish connecting your iPhone.</p>",
      ),
    );
  console.log(
    "Circle.social ngrok credential configured privately. No token displayed.",
  );
});
server.listen(3215, "127.0.0.1", () =>
  console.log("Private connection form ready at " + origin),
);
