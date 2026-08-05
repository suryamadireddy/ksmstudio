/**
 * Sanitize the post-auth `next` redirect target.
 *
 * The callback previously did `origin + next`. Values like `@evil.com` become
 * `https://<origin>@evil.com`, which WHATWG URL parsing treats as userinfo on
 * host `evil.com` — an open redirect after OAuth.
 */
export function safeAuthNextPath(
  next: string | null | undefined,
  fallback = "/studio"
): string {
  if (typeof next !== "string" || next.length === 0) {
    return fallback;
  }

  // Same-origin path only. Reject protocol-relative URLs and non-path forms.
  if (!next.startsWith("/") || next.startsWith("//")) {
    return fallback;
  }

  // Some URL parsers treat backslashes as slashes (`/\evil.com` → host evil.com).
  if (next.includes("\\") || next.includes("\0")) {
    return fallback;
  }

  return next;
}
