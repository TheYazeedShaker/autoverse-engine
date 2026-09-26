import * as Sentry from "@sentry/nextjs";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { FLAGS, isFlagEnabled } from "../lib/flags";
import { logger, traceIdFrom } from "../lib/log";
import { COPY, type Lang } from "../lib/showroom/copy";
import { loadShowroomPage } from "../lib/showroom/load";
import { formatPrice } from "../lib/showroom/loader";
import { configuredCatalogSource } from "../lib/showroom/source";

// The consumer app's entry: the Virtual Showroom for the brand-market this host names (spec §2).
// Slice 1 renders a skeleton only. The page's components land in slices 2–8.
//
// Rendered per request: the brand comes from the Host header. Catalogue caching belongs in the
// database-backed source, which waits on the read-path decision (ADR 0017).
export const dynamic = "force-dynamic";

export default async function Page() {
  const h = await headers();
  const traceId = traceIdFrom(h);
  // One trace id end to end: our log lines, the flag's failure log, and any Sentry report.
  Sentry.getIsolationScope().setTag("trace_id", traceId);
  const log = logger("consumer-showroom", traceId);
  const outcome = await loadShowroomPage({
    host: h.get("host"),
    rootDomain: process.env.CONSUMER_ROOT_DOMAIN,
    isEnabled: (subdomain) =>
      isFlagEnabled(FLAGS.pageShowroom, subdomain, undefined, undefined, traceId),
    source: await configuredCatalogSource(),
    log,
  });

  if (outcome.kind === "not_found") notFound();
  if (outcome.kind === "unavailable") {
    // Reported by Sentry through onRequestError (tagged with the trace id above); the visitor gets
    // the generic error page. Alerting: ADR 0017.
    throw new Error("showroom_unavailable");
  }

  const { showroom, themeCss } = outcome;
  const lang: Lang = "en";
  const t = COPY[lang];
  return (
    <>
      {themeCss && (
        // React 19 hoists a precedence style into <head>. The CSS is built from validated hex only.
        <style href="brand-theme" precedence="high">
          {themeCss}
        </style>
      )}
      <main lang={lang} dir={lang === "en" ? "ltr" : "rtl"} data-showroom={showroom.brand.slug}>
        <h1>{showroom.brand.name}</h1>
        <h2>{t.theRange}</h2>
        {showroom.models.map((model) => (
          <section key={model.id} id={model.slug} aria-labelledby={`${model.slug}-name`}>
            <h3 id={`${model.slug}-name`}>{model.name[lang]}</h3>
            <p>
              {model.fromPrice.kind === "amount" && `${t.from} `}
              {formatPrice(model.fromPrice, lang, showroom.market, t.priceOnRequest)}
            </p>
            <ul>
              {model.trims.map((trim) => (
                <li key={trim.id}>
                  {trim.name[lang]} ·{" "}
                  {formatPrice(trim.price, lang, showroom.market, t.priceOnRequest)}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
    </>
  );
}
