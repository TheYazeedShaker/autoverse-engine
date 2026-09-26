import { ModelSection, VehicleCard } from "@autoverse/ui";
import * as Sentry from "@sentry/nextjs";
import { headers } from "next/headers";
import Image from "next/image";
import { notFound } from "next/navigation";
import { FLAGS, isFlagEnabled } from "../lib/flags";
import { logger, traceIdFrom } from "../lib/log";
import { cardProps, sectionProps } from "../lib/showroom/cards";
import { COPY, type Lang } from "../lib/showroom/copy";
import { previewSubdomain } from "../lib/showroom/host";
import { assetBase, assetUrl } from "../lib/showroom/images";
import { loadShowroomPage } from "../lib/showroom/load";
import { configuredCatalogSource } from "../lib/showroom/source";
import { breakpoints } from "@autoverse/tokens";

// A missing ASSET_BASE_URL is logged once per server instance, not on every request.
let assetBaseWarned = false;

// The card image's rendered width per breakpoint (1 / 2 / 3 columns), from the token breakpoints.
const CARD_IMAGE_SIZES = `(min-width: ${breakpoints.xl}px) 30vw, (min-width: ${breakpoints.md}px) 45vw, 100vw`;

// The consumer app's entry: the Virtual Showroom for the brand-market this host names (spec §2).
// Slice 2: the range (a ModelSection per model, a VehicleCard per trim, real images). The hero,
// filters, drawer, compare and lead capture land in slices 3–8.
//
// Rendered per request: reading the Host header makes the route dynamic. The catalogue is cached
// per subdomain in the data source with a hard 60 s expiry (CATALOG_TTL_SECONDS; ADR 0017), and
// the flag is evaluated per request before it, so a kill never waits for the cache.

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{ lang?: string | string[] }>;
} = {}) {
  const h = await headers();
  const traceId = traceIdFrom(h);
  // One trace id end to end: our log lines, the flag's failure log, and any Sentry report.
  Sentry.getIsolationScope().setTag("trace_id", traceId);
  const log = logger("consumer-showroom", traceId);
  const outcome = await loadShowroomPage({
    host: h.get("host"),
    rootDomain: process.env.CONSUMER_ROOT_DOMAIN,
    previewSubdomain: previewSubdomain(process.env),
    isEnabled: (subdomain) =>
      isFlagEnabled(FLAGS.pageShowroom, subdomain, undefined, undefined, traceId),
    source: await configuredCatalogSource(),
    log,
    traceId,
  });

  if (outcome.kind === "not_found") notFound();
  if (outcome.kind === "unavailable") {
    // Reported by Sentry through onRequestError (tagged with the trace id above); the visitor gets
    // the generic error page. Alerting: ADR 0017.
    throw new Error("showroom_unavailable");
  }

  const { showroom, themeCss } = outcome;
  // EN by default; `?lang=ar` renders Arabic/RTL. The EN/AR toggle itself arrives with the TopBar
  // (slice 4) and will drive this same value.
  const lang: Lang = (await searchParams)?.lang === "ar" ? "ar" : "en";
  const t = COPY[lang];
  const base = assetBase(process.env.ASSET_BASE_URL);
  if (
    !base &&
    !assetBaseWarned &&
    showroom.models.some((m) => m.trims.some((tr) => tr.cardImage))
  ) {
    assetBaseWarned = true; // once per server instance: a config gap, not a per-request event
    log("warn", "showroom_asset_base_missing", { brand: showroom.brand.slug });
  }

  return (
    <>
      {themeCss && (
        // React 19 hoists a precedence style into <head>. The CSS is built from validated hex only.
        <style href="brand-theme" precedence="high">
          {themeCss}
        </style>
      )}
      <main lang={lang} dir={lang === "ar" ? "rtl" : "ltr"} data-showroom={showroom.brand.slug}>
        <section
          aria-labelledby="range-title"
          className="bg-surface-panel px-4 pt-12 pb-36 sm:px-[6.5vw] lg:pt-16"
        >
          <div className="mx-auto max-w-[120rem]">
            <p className="text-on-panel-muted text-xs tracking-[0.18em] uppercase rtl:tracking-normal">
              {showroom.brand.name} · {t.modelRange}
            </p>
            <h1
              id="range-title"
              className="text-on-panel mt-2 text-4xl font-light tracking-tight lg:text-6xl rtl:tracking-normal"
            >
              {t.theRange}
            </h1>
            <div className="mt-10 flex flex-col gap-12 lg:gap-16">
              {showroom.models.map((model) => {
                const section = sectionProps(model, lang, showroom.market, t);
                return (
                  <ModelSection key={model.id} {...section}>
                    {model.trims.map((trim) => {
                      const card = cardProps(model, trim, lang, showroom.market, t);
                      const src = trim.cardImage ? assetUrl(trim.cardImage.publicPath, base) : null;
                      return (
                        <VehicleCard
                          key={trim.id}
                          {...card}
                          image={
                            src ? (
                              <Image
                                src={src}
                                alt={t.sideView(card.title)}
                                fill
                                sizes={CARD_IMAGE_SIZES}
                                className="object-contain object-bottom"
                              />
                            ) : null
                          }
                        />
                      );
                    })}
                  </ModelSection>
                );
              })}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
