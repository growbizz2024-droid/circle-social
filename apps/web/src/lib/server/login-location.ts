import { createHmac } from "node:crypto";
import { isIP } from "node:net";
// Enable only behind an ingress that strips and overwrites the selected IP header.
// Never forward arbitrary client-supplied X-Forwarded-For or location headers.
export function loginLocationProof(
  request: Request,
  path: string,
  now = Date.now(),
): Record<string, string> {
  const header = process.env.CIRCLE_TRUSTED_CLIENT_IP_HEADER?.toLowerCase();
  const secret = process.env.CIRCLE_GEOIP_PROXY_SECRET;
  if (
    !header ||
    !["cf-connecting-ip", "x-real-ip", "x-vercel-forwarded-for"].includes(
      header,
    ) ||
    !secret ||
    secret.length < 32
  )
    return {};
  const ip = request.headers.get(header);
  if (!ip || ip.length > 45 || ip.includes("%") || !isIP(ip)) return {};
  const at = String(now);
  return {
    "x-circle-client-ip": ip,
    "x-circle-client-ip-at": at,
    "x-circle-client-ip-signature": createHmac("sha256", secret)
      .update(`${request.method}\n/v1/${path}\n${ip}\n${at}`)
      .digest("hex"),
  };
}
