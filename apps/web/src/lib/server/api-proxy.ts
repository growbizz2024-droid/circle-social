import { loginLocationProof } from "./login-location";
const routes: Record<string, readonly string[]> = {
  "auth/recovery/status": ["GET"],
  "auth/recovery/issue": ["POST"],
  "auth/recovery/confirm": ["POST"],
  "auth/recovery/options": ["POST"],
  "auth/recovery/verify": ["POST"],
  "users/me/complete": ["POST"],
  "users/me/communities": ["GET"],
  feed: ["GET"],
  posts: ["POST"],
  themes:["GET","POST"],
  "themes/state":["GET"],
  "themes/default":["POST"],
  "avatars/generate": ["POST"],
  "avatars/me": ["GET","PATCH"],
  "avatars/me/randomize": ["POST"],
  "avatars/me/reset": ["POST"],
  "avatars/me/export/svg": ["GET"],
  "avatars/me/export/png": ["GET"],
  media: ["POST"],
  discover: ["GET"],
  activity: ["GET"],
  "activity/read": ["POST"],
  communities: ["GET"],
  "users/me": ["GET", "PATCH"],
  "users/me/onboarding": ["PUT"],
  "users/me/deactivate": ["POST"],
  "auth/registration/options": ["POST"],
  "auth/registration/verify": ["POST"],
  "auth/authentication/options": ["POST"],
  "auth/authentication/verify": ["POST"],
  "auth/me": ["GET"],
  "auth/sessions": ["GET"],
  "auth/passkeys": ["GET"],
  "auth/logout": ["POST"],
  "auth/logout-all": ["POST"],
  "auth/mobile/authorize": ["POST"],
  "auth/mobile/exchange": ["POST"],
};
export async function proxyApi(
  request: Request,
  segments: string[],
): Promise<Response> {
  const path = segments.join("/");
  const methods =
    routes[path] ??
    (/^auth\/(sessions|passkeys)\/[A-Za-z0-9_-]{1,2048}$/.test(path)
      ? ["DELETE"]
      : /^themes\/[0-9a-f-]{36}$/.test(path)?["PATCH","DELETE"]
      : /^themes\/[0-9a-f-]{36}\/(apply|duplicate|restore)$/.test(path)?["POST"]
      : /^media\/[0-9a-f-]{36}$/.test(path)
        ? ["GET", "DELETE"]
        : /^communities\/[0-9a-f-]{36}\/detail$/.test(path)
          ? ["GET"]
          : /^posts\/[0-9a-f-]{36}$/.test(path)
            ? ["GET", "DELETE"]
            : /^posts\/[0-9a-f-]{36}\/(like|save|repost)$/.test(path)
              ? ["PUT"]
              : /^posts\/[0-9a-f-]{36}\/comments$/.test(path)
                ? ["GET", "POST"]
                : /^posts\/[0-9a-f-]{36}\/restore$/.test(path)
                  ? ["POST"]
                  : /^profiles\/[a-z0-9_]{3,40}\/follow$/.test(path)
                    ? ["PUT"]
                    : /^communities\/[0-9a-f-]{36}\/membership$/.test(path)
                      ? ["PUT"]
                      : []);
  const fail = (status: number, message: string) =>
    Response.json(
      { error: { code: `HTTP_${status}`, message } },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  if (!methods.includes(request.method)) return fail(404, "Not found");
  const origin = process.env.CIRCLE_WEB_ORIGIN ?? "http://localhost:3000";
  if (request.method !== "GET" && request.headers.get("origin") !== origin)
    return fail(403, "Request forbidden");
  const headers = new Headers({
    Accept: "application/json",
    Origin: origin,
    ...loginLocationProof(request, path),
  });
  const cookies = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((c) => c.trim())
    .filter((c) =>
      /^(?:__Host-)?circle_(?:session|registration|authentication|recovery)=/.test(
        c,
      ),
    );
  if (cookies.length) headers.set("cookie", cookies.join("; "));
  if (path.startsWith("media/") && request.headers.has("range"))
    headers.set("Range", request.headers.get("range")!);
  if(path.startsWith("avatars/me/export/") && request.headers.has("if-none-match"))headers.set("If-None-Match",request.headers.get("if-none-match")!);
  let body: ArrayBuffer | string | undefined;
  if (!["GET", "HEAD"].includes(request.method) && (request.method!=="DELETE" || path.startsWith("themes/"))) {
    const upload = path === "media";
    const contentType = request.headers.get("content-type") ?? "";
    if (
      upload
        ? !/^(image\/(jpeg|png|webp|heic|heif)|audio\/(wav|wave|mpeg|mp4|webm|ogg)|video\/webm)(;.*)?$/.test(
            contentType,
          )
        : !contentType.startsWith("application/json")
    )
      return fail(415, "JSON required");
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      for (;;) {
        const value = await reader.read();
        if (value.done) break;
        size += value.value.byteLength;
        if (size > (upload ? 12 * 1024 * 1024 : 65536)) {
          await reader.cancel();
          return fail(413, "Request too large");
        }
        chunks.push(value.value);
      }
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    body = upload ? bytes.buffer : new TextDecoder().decode(bytes);
    headers.set("Content-Type", upload ? contentType : "application/json");
  }
  try {
    const response = await fetch(
      new URL(
        `/v1/${path}${new URL(request.url).search}`,
        process.env.CIRCLE_API_URL ?? "http://127.0.0.1:3001",
      ),
      {
        method: request.method,
        headers,
        body,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(30000),
      },
    );
    const outgoing = new Headers({
      "Content-Type":
        response.headers.get("content-type") ?? "application/json",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    for (const value of response.headers.getSetCookie())
      outgoing.append("Set-Cookie", value);
    const id = response.headers.get("x-request-id");
    if (id) outgoing.set("x-request-id", id);
    for (const name of [
      "content-range",
      "accept-ranges",
      "content-disposition", "etag",
    ]) {
      const value = response.headers.get(name);
      if (value) outgoing.set(name, value);
    }
    return new Response(response.status===304?null:await response.arrayBuffer(), {
      status: response.status,
      headers: outgoing,
    });
  } catch {
    return fail(503, "Circle.social is temporarily unavailable");
  }
}
