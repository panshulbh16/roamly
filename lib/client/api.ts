// The one way Roamly's pages call its own server. The Worker (worker/index.ts) answers /api/ requests only
// when they carry this header: another site can't add it without a CORS preflight, which the API never grants,
// and an API address typed into the browser doesn't send it, so the API isn't usable from outside the app.
export const CLIENT_HEADER = "X-Roamly-Client";
export const CLIENT_ID = "web";

export function api(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set(CLIENT_HEADER, CLIENT_ID);
  return fetch(path, { ...init, headers });
}
