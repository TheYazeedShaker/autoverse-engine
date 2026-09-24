// What a public capture request must carry, and how the client is identified for rate limiting.
// Pure (Web Crypto only), so it runs in Deno and is unit tested in Node.
//
// The page sends:
//   Origin                  set by the browser
//   X-Autoverse-Key         the brand's publishable key (not a secret)
//   X-Autoverse-Market      the market the page is serving, e.g. "EG" (named, never guessed)
// The database resolves the brand from these (app_auth.resolve_public_caller). The body can't.

export interface PublicCaller {
  key: string;
  origin: string;
  market: string;
}

export function readPublicCaller(headers: Headers): PublicCaller | null {
  const key = headers.get("x-autoverse-key")?.trim() ?? "";
  const origin = headers.get("origin")?.trim() ?? "";
  const market = headers.get("x-autoverse-market")?.trim().toUpperCase() ?? "";
  if (!/^pk_[A-Za-z0-9]{32}$/.test(key) || !origin || !/^[A-Z]{2}$/.test(market)) return null;
  return { key, origin, market };
}

/**
 * The client address the platform saw. Supabase's edge sits behind a proxy that sets
 * x-forwarded-for; its first entry is the visitor.
 */
export function clientAddress(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/**
 * A keyed hash of the client address: stable enough to rate-limit one visitor, useless for
 * recovering the address. A plain hash of an IPv4 address can be brute-forced, so it would still
 * be personal data. An HMAC with a server secret can't be (the #30 security review).
 */
export async function clientId(address: string, secret: string): Promise<string> {
  if (!secret) throw new Error("CLIENT_HASH_SECRET is not set");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(address)));
  return Array.from(mac.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * How the admission gate's refusals map to HTTP. The message is generic on purpose: a caller
 * never learns whether the key, the origin, the market or the gateway was wrong.
 */
export function refusalStatus(code: string | undefined): { status: number; error: string } | null {
  switch (code) {
    case "42501":
      return { status: 403, error: "Not authorized." };
    case "AV429":
      return { status: 429, error: "Too many requests. Try again shortly." };
    case "22023":
      return { status: 400, error: "Malformed request." };
    default:
      return null;
  }
}
