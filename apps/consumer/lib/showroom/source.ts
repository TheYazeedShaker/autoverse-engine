import type {
  AssetRow,
  BrandMarketRow,
  BrandRow,
  BrandThemeRow,
  ModelRow,
  TrimPriceRow,
  TrimRow,
} from "@autoverse/engine-core";

// The seam between the showroom and the database.
//
// How an anonymous visitor's request reads the published catalogue is an open Tier B decision
// (#build-decisions, "How does the consumer server read the published catalogue"). Under today's
// RLS anon reads nothing, and the service-role key never goes near an anonymous caller (production
// plan §3.1, ADR 0013). Until the owner decides, the page is written against this interface and no
// database-backed source exists, so with no source the page answers 404.
//
// A source returns rows exactly as the engine stores them. Everything the page shows is derived
// from them in loader.ts, which re-checks publish and live state as a second layer: whatever the
// source's own guarantees, a draft row never reaches the page.

export interface CatalogSnapshot {
  brand: Pick<BrandRow, "id" | "slug" | "name" | "status">;
  market: BrandMarketRow;
  theme: BrandThemeRow | null;
  models: ModelRow[];
  trims: TrimRow[];
  /** This market's prices only. */
  prices: TrimPriceRow[];
  /** Registry rows for the brand's published models (card `side`, hero `front-34`). */
  assets: AssetRow[];
}

export interface CatalogSource {
  /**
   * The brand-market a subdomain names, with its catalogue. Null when there is none. The signal
   * aborts on the caller's timeout; a real source passes it to its fetch.
   */
  load(subdomain: string, signal?: AbortSignal): Promise<CatalogSnapshot | null>;
}

/**
 * The configured source, or null. No database-backed source exists yet (see above). For local
 * development only, `SHOWROOM_SOURCE=fixture` serves the demo fixture; it can never switch on in a
 * production build, previews included.
 */
export async function configuredCatalogSource(
  env: Record<string, string | undefined> = process.env,
): Promise<CatalogSource | null> {
  // Refused on any Vercel deployment as well, so a stray NODE_ENV project variable can't enable it.
  const deployed = Boolean(env.VERCEL || env.VERCEL_ENV);
  if (env.NODE_ENV !== "production" && !deployed && env.SHOWROOM_SOURCE === "fixture") {
    const { demoCatalog } = await import("./fixtures/demo-catalog");
    return {
      load: async (subdomain) => {
        const snapshot = demoCatalog();
        return snapshot.market.subdomain === subdomain ? snapshot : null;
      },
    };
  }
  return null;
}
