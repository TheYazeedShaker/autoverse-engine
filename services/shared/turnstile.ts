// Cloudflare Turnstile: the bot check on lead capture (owner decision). Fails CLOSED. If the
// secret is missing, Cloudflare is unreachable, or the answer isn't a clear success, the lead is
// refused (the form shows "try again"). It is never waved through.

export const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileDeps {
  secret: string | undefined;
  fetch: typeof fetch;
  timeoutMs: number;
}

export async function verifyTurnstile(
  token: string | null | undefined,
  remoteIp: string,
  deps: TurnstileDeps,
): Promise<boolean> {
  if (!token || !deps.secret) return false;
  const form = new URLSearchParams({ secret: deps.secret, response: token });
  if (remoteIp && remoteIp !== "unknown") form.set("remoteip", remoteIp);
  try {
    const response = await deps.fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(deps.timeoutMs),
    });
    if (!response.ok) return false;
    const result = (await response.json()) as { success?: unknown };
    return result.success === true;
  } catch {
    return false;
  }
}
