import { ModelSection, TopBar, VehicleCard } from "@autoverse/ui";
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
import { facetGroups, modelFacts } from "../lib/showroom/range";
import { ShowroomExperience } from "./showroom-experience";
import { dirOf, langFrom } from "../lib/showroom/lang";
import { configuredCatalogSource } from "../lib/showroom/source";
import { breakpoints, carFrame, heroCarousel } from "@autoverse/tokens";

// A missing ASSET_BASE_URL is logged once per server instance, not on every request.
let assetBaseWarned = false;

// The card image's rendered width per breakpoint (1 / 2 / 3 columns), from the token breakpoints.
const CARD_IMAGE_SIZES = `(min-width: ${breakpoints.xl}px) 30vw, (min-width: ${breakpoints.md}px) 45vw, 100vw`;
// The hero car: the slide (heroCarousel.slide of the stage from md, full width below) × the hero fill.
const HERO_IMAGE_SIZES = `(min-width: ${breakpoints.md}px) ${Math.round(100 * heroCarousel.slide * carFrame.heroFill)}vw, ${Math.round(100 * carFrame.heroFill)}vw`;
// The brand-invariant hero backdrop (an Autoverse asset, no column; decision on PR #68). Set by
// next.config.js only when the file is in public/, so a missing file never becomes a broken request.
const HERO_BACKDROP = process.env.HERO_BACKDROP || null;

/**
 * Hero image loading (spec §5.3): the first model's first trim is the page's one high-priority fetch;
 * its neighbours (the next and, looping, the last model) load eagerly; everything else is lazy.
 */
function heroLoading(index: number, trimIndex: number, total: number) {
  if (index === 0 && trimIndex === 0) return { preload: true, fetchPriority: "high" as const };
  const neighbour = index === 1 || index === total - 1;
  return { loading: neighbour && trimIndex === 0 ? ("eager" as const) : ("lazy" as const) };
}

// The consumer app's entry: the Virtual Showroom for the brand-market this host names (spec §2).
// Slices 2–4: the hero carousel and model dock, and the range (a ModelSection per model, a
// VehicleCard per trim) with its filters, search and sort, all in ShowroomExperience. The drawer,
// compare and lead capture land in slices 5–8.
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
  // EN by default; `?lang=ar` renders Arabic/RTL. The TopBar's EN/AR switch links to the two; the
  // proxy passes the same choice to the layout for `<html lang dir>`.
  const lang: Lang = langFrom((await searchParams)?.lang);
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
      <div dir={dirOf(lang)} lang={lang}>
        <TopBar
          // The theme's logo reference has no defined format yet (asset id or public path), so the
          // brand name is the wordmark until it does (an open decision; the logo is a theme slot).
          brandName={showroom.brand.name}
          marketLabel={`${showroom.market.code} · ${showroom.market.currency}`}
          languageLabel={t.language}
          languages={[
            { code: "en", label: "EN", href: "?lang=en", current: lang === "en" },
            { code: "ar", label: "عربي", href: "?lang=ar", current: lang === "ar" },
          ]}
          // Opens the LeadModal from slice 7; disabled until then.
          bookTestDrive={{ label: t.bookTestDrive }}
        />
      </div>
      <main lang={lang} dir={dirOf(lang)} data-showroom={showroom.brand.slug}>
        <ShowroomExperience
          lang={lang}
          locale={showroom.market.locale}
          numberingSystem={
            new Intl.NumberFormat(lang === "ar" ? showroom.market.locale : "en").resolvedOptions()
              .numberingSystem
          }
          hero={showroom.models.map((model, index) => ({
            id: model.id,
            name: model.name[lang],
            trims: model.trims.map((trim, trimIndex) => {
              const src = trim.heroImage ? assetUrl(trim.heroImage.publicPath, base) : null;
              return {
                id: trim.id,
                label: trim.name[lang],
                stats: {
                  powerHp: trim.stats.powerHp,
                  topSpeedKph: trim.stats.topSpeedKph,
                  accelS: trim.stats.accelS,
                },
                image: src ? (
                  <Image
                    src={src}
                    alt={t.frontView(`${model.name[lang]} ${trim.name[lang]}`)}
                    fill
                    sizes={HERO_IMAGE_SIZES}
                    className="object-contain object-bottom"
                    {...heroLoading(index, trimIndex, showroom.models.length)}
                  />
                ) : null,
              };
            }),
          }))}
          dock={showroom.models.map((m) => ({ id: m.id, name: m.name[lang], slug: m.slug }))}
          backdrop={
            HERO_BACKDROP ? (
              <Image src={HERO_BACKDROP} alt="" fill sizes="100vw" className="object-cover" />
            ) : undefined
          }
          range={{
            facets: facetGroups(showroom.facets),
            header: (
              <div>
                <p className="text-on-panel-muted text-xs tracking-[0.18em] uppercase rtl:tracking-normal">
                  {showroom.brand.name} · {t.modelRange}
                </p>
                <h1
                  id="range-title"
                  className="text-on-panel mt-2 text-4xl font-light tracking-tight lg:text-6xl rtl:tracking-normal"
                >
                  {t.theRange}
                </h1>
              </div>
            ),
            sections: showroom.models.map((model) => {
              const section = sectionProps(model, lang, showroom.market, t);
              return {
                facts: modelFacts(model),
                node: (
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
                ),
              };
            }),
          }}
        />
      </main>
    </>
  );
}
