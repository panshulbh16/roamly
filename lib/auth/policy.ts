export function safeReturnTo(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\r\n]/.test(value)
  )
    return "/";
  try {
    const url = new URL(value, "https://roamly.local");
    if (
      url.origin !== "https://roamly.local" ||
      url.pathname.startsWith("/auth") ||
      url.pathname.startsWith("/api/auth") ||
      url.pathname.startsWith("/signin-with-chatgpt") ||
      url.pathname.startsWith("/signout-with-chatgpt")
    )
      return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}
export function authPath(returnTo = "/") {
  return "/auth?returnTo=" + encodeURIComponent(safeReturnTo(returnTo));
}
