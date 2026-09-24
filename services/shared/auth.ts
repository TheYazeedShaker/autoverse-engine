// Who may run the worker (owner decision, ADR 0011):
//   * the pg_cron call, with the shared secret: `Authorization: Bearer <JOB_WORKER_CRON_SECRET>`
//   * a person pressing "run now", with a superadmin/ops JWT (the same scope as
//     app_auth.can_manage_tenancy()).
// Anyone else is refused, and the worker runs nothing.

export type Caller = "cron" | "staff";

export interface AuthDeps {
  /** JOB_WORKER_CRON_SECRET. Unset means no cron call can authenticate (fail closed). */
  cronSecret: string | undefined;
  /** True when the JWT belongs to a superadmin or ops user. */
  isTenancyManager: (jwt: string) => Promise<boolean>;
}

/** The two roles that may manage tenancy, and so may trigger operational work by hand. */
export const MANAGER_ROLES = ["superadmin", "ops"] as const;

export async function authorize(
  authorization: string | null,
  deps: AuthDeps,
): Promise<Caller | null> {
  const token = bearerToken(authorization);
  if (!token) return null;
  if (deps.cronSecret && (await constantTimeEqual(token, deps.cronSecret))) return "cron";
  // Only something shaped like a JWT goes to the auth server, so a wrong secret costs no round trip.
  if (token.split(".").length === 3 && (await deps.isTenancyManager(token))) return "staff";
  return null;
}

/** The token from `Authorization: Bearer <token>`, or null. */
export function bearerToken(authorization: string | null): string | null {
  return /^Bearer (\S+)$/.exec(authorization ?? "")?.[1] ?? null;
}

/**
 * Compare two strings without leaking where they differ. Both sides are hashed first, so the
 * comparison is always over 32 bytes whatever the input lengths.
 */
export async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [x, y] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  const left = new Uint8Array(x);
  const right = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}
