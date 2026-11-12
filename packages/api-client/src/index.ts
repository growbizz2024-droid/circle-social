import type {
  ApiResponse,
  CommunitySummary,
  Page,
  UserSummary,
  UserProfile,
  ProfileUpdate,
  SessionSummary,
  PasskeySummary,
} from "@circle/shared-types";
export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly requestId: string | null,
  ) {
    super(`API request failed (${status})`);
  }
}
export function createApiClient(
  baseUrl: string,
  options: {
    fetch?: typeof fetch;
    authorization?: () => string | undefined;
  } = {},
) {
  const transport = options.fetch ?? fetch;
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!path.startsWith("/") || path.startsWith("//"))
      throw new Error("API path must be relative");
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    const auth = options.authorization?.();
    if (auth) headers.set("Authorization", auth);
    const response = await transport(
      `${baseUrl.replace(/\/$/, "")}/v1${path}`,
      { ...init, credentials: "include", headers },
    );
    if (!response.ok)
      throw new ApiClientError(
        response.status,
        response.headers.get("x-request-id"),
      );
    return (await response.json()) as T;
  }
  return {
    request,
    me: () => request<ApiResponse<UserSummary>>("/auth/me"),
    profile: () => request<ApiResponse<UserProfile>>("/users/me"),
    updateProfile: (body: ProfileUpdate) =>
      request<ApiResponse<UserProfile>>("/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    sessions: () => request<ApiResponse<SessionSummary[]>>("/auth/sessions"),
    passkeys: () => request<ApiResponse<PasskeySummary[]>>("/auth/passkeys"),

    communities: () =>
      request<ApiResponse<Page<CommunitySummary>>>("/communities"),
  };
}
