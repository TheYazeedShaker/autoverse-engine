import { ModelSection, TopBar, VehicleCard } from "@autoverse/ui";
import Image from "next/image";
import { notFound } from "next/navigation";
import { FLAGS, isFlagEnabled } from "../lib/flags";
import { cardProps, sectionProps } from "../lib/showroom/cards";
import { COPY, type Lang } from "../lib/showroom/copy";
import { assetBase, assetUrl } from "../lib/showroom/images";
import { facetGroups, modelFacts } from "../lib/showroom/range";
import { ShowroomExperience } from "./showroom-experience";
import { loadGatedShowroom } from "./showroom-gate";
import { TechnicalDataButton } from "./spec-drawer-trigger";
import { CompareCheckbox } from "./compare-controls";
import { drawerContent } from "../lib/showroom/drawer";
import { dirOf, langFrom } from "../lib/showroom/lang";
import { breakpoints, carFrame, heroCarousel } from "@autoverse/tokens";
import { leadConfig } from "../lib/lead/config";
import { LEAD_COPY } from "../lib/lead/copy";
import { interestOption } from "../lib/lead/form";
import { whatsappHref } from "../lib/lead/phone";
import { LeadButton, LeadCapture } from "./lead-capture";

// A missing ASSET_BASE_URL is logged once per server instance, not on every request.
let assetBaseWarned = false;

// The card image's rendered width per breakpoint (1 / 2 / 3 columns), from the token breakpoints.
const CARD_IMAGE_SIZES = `(min-width: ${breakpoints.xl}px) 30vw, (min-width: ${breakpoints.md}px) 45vw, 100vw`;
// The drawer is 40vw wide from md (the approved panel width), full width below.
const DRAWER_IMAGE_SIZES = `(min-width: ${breakpoints.md}px) 40vw, 100vw`;
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
  const { outcome, traceId, log } = await loadGatedShowroom("consumer-showroom");

  if (outcome.kind === "not_found") notFound();
  if (outcome.kind === "unavailable") {
    // Reported by Sentry through onRequestError (tagged with the trace id above); the visitor gets
    // the generic error page. Alerting: ADR 0017.
    throw new Error("showroom_unavailable");
  }

  const { showroom, themeCss, logos, subdomain } = outcome;
  // The compare page placeholder has its own flag (slice 6), evaluated per request like the page's.
  // Off, the tray still works and "Compare N" is disabled.
  const [compareOn, leadOn, params] = await Promise.all([
    isFlagEnabled(FLAGS.pageCompare, subdomain, undefined, undefined, traceId),
    // Lead capture (slice 7): every lead CTA and the modal. Off → none of them render.
    isFlagEnabled(FLAGS.showroomLeadCapture, subdomain, undefined, undefined, traceId),
    searchParams,
  ]);
  const logoSrc = logos.dark ? assetUrl(logos.dark, assetBase(process.env.ASSET_BASE_URL)) : null;
  // EN by default; `?lang=ar` renders Arabic/RTL. The TopBar's EN/AR switch links to the two; the
  // proxy passes the same choice to the layout for `<html lang dir>`.
  const lang: Lang = langFrom(params?.lang);
  const t = COPY[lang];
  const base = assetBase(process.env.ASSET_BASE_URL);
  // Lead capture needs, beyond the flag: the market's consent text, the brand's capture key, the
  // Turnstile site key and capture-lead's URL. With the flag on, a missing one is an error: the
  // brand is losing leads (ADR 0025, fail closed).
  const lead = leadOn
    ? leadConfig(
        showroom,
        lang,
        {
          supabaseUrl: process.env.SUPABASE_URL,
          siteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
        },
        whatsappHref,
      )
    : null;
  if (lead && !lead.ok) {
    log("error", "showroom_lead_capture_unavailable", {
      brand: showroom.brand.slug,
      market: showroom.market.code,
      reason: lead.reason,
    });
  }
  const leadReady = lead?.ok ? lead.config : null;
  if (
    !base &&
    !assetBaseWarned &&
    showroom.models.some((m) => m.trims.some((tr) => tr.cardImage))
  ) {
    assetBaseWarned = true; // once per server instance: a config gap, not a per-request event
    log("warn", "showroom_asset_base_missing", { brand: showroom.brand.slug });
  }

  const page = (
    <>
      <div dir={dirOf(lang)} lang={lang}>
        <TopBar
          brandName={showroom.brand.name}
          // The bar is dark, so it takes the logo FOR DARK SURFACES (logo_dark; ADR 0024; logos are
          // named by the surface they go on). A plain <img>, never inline SVG, so a logo file can't
          // run script in the page. Without one (or without ASSET_BASE_URL), the wordmark.
          logo={
            logoSrc ? (
              <img
                src={logoSrc}
                alt={showroom.brand.name}
                className="h-6 w-auto max-w-40 object-contain"
              />
            ) : null
          }
          marketLabel={`${showroom.market.code} · ${showroom.market.currency}`}
          languageLabel={t.language}
          languages={[
            { code: "en", label: "EN", href: "?lang=en", current: lang === "en" },
            { code: "ar", label: "عربي", href: "?lang=ar", current: lang === "ar" },
          ]}
          // Opens the LeadModal (slice 7) when lead capture is on; honestly disabled otherwise.
          bookTestDrive={{ label: t.bookTestDrive }}
          bookTestDriveSlot={
            leadReady ? (
              <LeadButton
                request={{ type: "test_drive" }}
                label={t.bookTestDrive}
                variant="primary"
                size="sm"
              />
            ) : undefined
          }
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
          // Compare (slice 6): the compare page only while its flag is on; per trim, its name and tray
          // thumbnail.
          compareBase={compareOn ? "/compare" : null}
          compare={Object.fromEntries(
            showroom.models.flatMap((model) =>
              model.trims.map((trim) => {
                const name = cardProps(model, trim, lang, showroom.market, t).title;
                const src = trim.cardImage ? assetUrl(trim.cardImage.publicPath, base) : null;
                return [
                  trim.id,
                  {
                    name,
                    thumbnail: src ? (
                      <Image
                        src={src}
                        alt={t.sideView(name)}
                        fill
                        sizes="5rem"
                        loading="lazy"
                        className="object-contain"
                      />
                    ) : null,
                  },
                ];
              }),
            ),
          )}
          // The spec drawer per trim (slice 5): the ledger resolved on the server for that trim, and
          // its side-view image (the same master as its card; ADR 0022).
          drawers={Object.fromEntries(
            showroom.models.flatMap((model) =>
              model.trims.map((trim) => {
                const src = trim.cardImage ? assetUrl(trim.cardImage.publicPath, base) : null;
                const content = drawerContent(
                  model,
                  trim,
                  lang,
                  showroom.market,
                  showroom.brand.name,
                  t,
                );
                return [
                  trim.id,
                  {
                    content,
                    image: src ? (
                      <Image
                        src={src}
                        alt={t.sideView(`${content.modelName} ${content.trimName}`)}
                        fill
                        sizes={DRAWER_IMAGE_SIZES}
                        loading="lazy"
                        className="object-contain object-bottom"
                      />
                    ) : null,
                  },
                ];
              }),
            ),
          )}
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
                  <ModelSection
                    key={model.id}
                    {...section}
                    action={
                      leadReady ? (
                        <LeadButton
                          request={{ type: "quote", modelId: model.id }}
                          label={LEAD_COPY[lang].requestQuote}
                          variant="ghost"
                          size="sm"
                        />
                      ) : undefined
                    }
                  >
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
                          compareSlot={
                            <CompareCheckbox
                              trimId={trim.id}
                              label={t.compare}
                              limitNote={t.compareLimit}
                            />
                          }
                          technicalDataSlot={
                            <TechnicalDataButton
                              trimId={trim.id}
                              label={t.technicalData}
                              dir={dirOf(lang)}
                            />
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

  return (
    <>
      {themeCss && (
        // React 19 hoists a precedence style into <head>. The CSS is built from validated hex only.
        <style href="brand-theme" precedence="high">
          {themeCss}
        </style>
      )}
      {leadReady ? (
        <LeadCapture
          config={leadReady}
          lang={lang}
          interestOptions={showroom.models.flatMap((m) => [
            { value: interestOption("model", m.id), label: m.name[lang] },
            ...m.trims.map((tr) => ({
              value: interestOption("trim", tr.id),
              label: `${m.name[lang]} · ${tr.name[lang]}`,
            })),
          ])}
          trimModel={showroom.models.flatMap((m) =>
            m.trims.map((tr) => [tr.id, m.id] as [string, string]),
          )}
          modelNames={Object.fromEntries(showroom.models.map((m) => [m.id, m.name[lang]]))}
        >
          {page}
        </LeadCapture>
      ) : (
        page
      )}
    </>
  );
}
