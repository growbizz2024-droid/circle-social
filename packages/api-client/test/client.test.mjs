import { test } from "node:test";
import assert from "node:assert/strict";
import { createApiClient, ApiClientError } from "../dist/index.js";
await test("API client handles typed envelopes, cookies and optional authorization", async () => {
  let called;
  const api = createApiClient("https://api.example/", {
    authorization: () => "Bearer fixture",
    fetch: async (url, options) => {
      called = { url, options };
      return new Response(
        JSON.stringify({ data: { id: "u" }, requestId: "r" }),
        { status: 200 },
      );
    },
  });
  assert.equal((await api.me()).data.id, "u");
  assert.equal(called.url, "https://api.example/v1/auth/me");
  assert.equal(called.options.credentials, "include");
  assert.equal(called.options.headers.get("authorization"), "Bearer fixture");
});
await test("API client keeps server error payloads out of thrown messages", async () => {
  const api = createApiClient("https://api.example", {
    fetch: async () => new Response("private backend error", { status: 503 }),
  });
  await assert.rejects(
    () => api.me(),
    (e) =>
      e instanceof ApiClientError &&
      e.status === 503 &&
      !e.message.includes("private"),
  );
  await assert.rejects(() => api.request("//evil.example"));
});
