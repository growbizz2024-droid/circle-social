import { test } from "node:test";
import assert from "node:assert/strict";
import { httpsOrigin, updateMobileEnvironment } from "./mobile-https.mjs";
test("only a complete trusted HTTPS ngrok development origin can configure passkeys", () => {
  assert.equal(
    httpsOrigin("https://example.ngrok-free.dev/"),
    "https://example.ngrok-free.dev",
  );
  for (const v of [
    "http://example.ngrok-free.dev",
    "https://example.ngrok-free.dev.evil.test",
    "https://user:secret@example.ngrok-free.dev",
    "https://example.ngrok-free.dev/path",
    "https://example.ngrok-free.dev?next=elsewhere",
    "https://example.ngrok-free.dev:8443",
    "file:///tmp/test",
    "https://example..ngrok-free.dev",
  ])
    assert.throws(() => httpsOrigin(v), v);
});
test("phone configuration changes only the two public connection URLs", () => {
  const source =
    "# retained\nOTHER_SETTING=retained\nEXPO_PUBLIC_API_URL=http://old:3001\nEXPO_PUBLIC_WEB_URL=http://localhost:3200\n";
  const next = updateMobileEnvironment(
    source,
    "http://192.168.1.2:3002",
    "https://example.ngrok-free.dev",
  );
  assert.ok(next.includes("OTHER_SETTING=retained"));
  assert.ok(next.includes("# retained"));
  assert.ok(!next.includes("http://old"));
  assert.equal(next.match(/EXPO_PUBLIC_API_URL=/g).length, 1);
  assert.equal(next.match(/EXPO_PUBLIC_WEB_URL=/g).length, 1);
});
