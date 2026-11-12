import { test, expect } from "@playwright/test";
import { createHmac } from "node:crypto";
import { loginLocationProof } from "../apps/web/src/lib/server/login-location";
test("web proxy only signs an explicitly configured single-IP ingress header", () => {
  const oldHeader = process.env.CIRCLE_TRUSTED_CLIENT_IP_HEADER,
    oldSecret = process.env.CIRCLE_GEOIP_PROXY_SECRET;
  const secret = "test-ingress-key-".repeat(4),
    now = Date.now(),
    path = "auth/authentication/verify";
  try {
    delete process.env.CIRCLE_TRUSTED_CLIENT_IP_HEADER;
    delete process.env.CIRCLE_GEOIP_PROXY_SECRET;
    const request = new Request("http://localhost:3200/api/v1/" + path, {
      method: "POST",
      headers: {
        "cf-connecting-ip": "8.8.8.8",
        "x-circle-client-ip": "1.1.1.1",
      },
    });
    expect(loginLocationProof(request, path, now)).toEqual({});
    process.env.CIRCLE_TRUSTED_CLIENT_IP_HEADER = "cf-connecting-ip";
    process.env.CIRCLE_GEOIP_PROXY_SECRET = secret;
    const proof = loginLocationProof(request, path, now);
    expect(proof["x-circle-client-ip"]).toBe("8.8.8.8");
    expect(proof["x-circle-client-ip-signature"]).toBe(
      createHmac("sha256", secret)
        .update(`POST\n/v1/${path}\n8.8.8.8\n${now}`)
        .digest("hex"),
    );
    const forged = new Request(request.url, {
      method: "POST",
      headers: { "cf-connecting-ip": "8.8.8.8, 1.1.1.1" },
    });
    expect(loginLocationProof(forged, path, now)).toEqual({});
    process.env.CIRCLE_TRUSTED_CLIENT_IP_HEADER = "x-forwarded-for";
    expect(loginLocationProof(request, path, now)).toEqual({});
  } finally {
    if (oldHeader === undefined)
      delete process.env.CIRCLE_TRUSTED_CLIENT_IP_HEADER;
    else process.env.CIRCLE_TRUSTED_CLIENT_IP_HEADER = oldHeader;
    if (oldSecret === undefined) delete process.env.CIRCLE_GEOIP_PROXY_SECRET;
    else process.env.CIRCLE_GEOIP_PROXY_SECRET = oldSecret;
  }
});
