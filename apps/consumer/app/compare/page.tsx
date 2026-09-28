import { notFound } from "next/navigation";
import { FLAGS, isFlagEnabled } from "../../lib/flags";
import { cardProps } from "../../lib/showroom/cards";
import { parseCompareParam } from "../../lib/showroom/compare";
import { loadGatedShowroom } from "../showroom-gate";
import { COPY } from "../../lib/showroom/copy";
import { dirOf, langFrom } from "../../lib/showroom/lang";

// The compare page PLACEHOLDER (spec §5.9) until PAGE-CONSUMER-COMPARE ships with its own spec.
//
// - The showroom's gates first (host → brand-market, `page_showroom`), then its OWN flag
//   `page_compare` (default off). Any "no" is the same brand-neutral 404.
// - `?trims=` is untrusted: at most 3 uuids (parseCompareParam), and only trims that are in this
//   brand-market's PUBLISHED catalogue are shown. Anything else is simply left out.
// - It lists the picked trims and says the comparison is coming, with a way back. Nothing here is
//   the real comparison; that page gets its own spec, design and slices.

export const metadata = { robots: { index: false } };

export default async function ComparePage({
  searchParams,
}: {
  searchParams?: Promise<{ trims?: string | string[]; lang?: string | string[] }>;
} = {}) {
  const { outcome, traceId, log } = await loadGatedShowroom("consumer-compare");
  if (outcome.kind === "not_found") notFound();
  if (outcome.kind === "unavailable") throw new Error("showroom_unavailable");

  const { showroom, subdomain } = outcome;
  if (!(await isFlagEnabled(FLAGS.pageCompare, subdomain, undefined, undefined, traceId))) {
    log("info", "compare_not_found", { reason: "flag_off", subdomain });
    notFound();
  }

  const params = await searchParams;
  const lang = langFrom(params?.lang);
  const t = COPY[lang];
  const wanted = parseCompareParam(params?.trims);
  const picked = wanted.flatMap((id) => {
    for (const model of showroom.models) {
      const trim = model.trims.find((tr) => tr.id === id);
      if (trim) return [cardProps(model, trim, lang, showroom.market, t)];
    }
    return [];
  });
  log("info", "compare_view", { subdomain, requested: wanted.length, shown: picked.length });

  return (
    <main
      lang={lang}
      dir={dirOf(lang)}
      data-compare-placeholder
      className="bg-surface-panel text-on-panel min-h-screen px-4 py-16 sm:px-[6.5vw]"
    >
      <div className="mx-auto max-w-3xl">
        <p className="text-on-panel-muted text-xs tracking-[0.18em] uppercase rtl:tracking-normal">
          {showroom.brand.name}
        </p>
        <h1 className="mt-2 text-4xl font-light tracking-tight rtl:tracking-normal">
          {t.compareTitle}
        </h1>
        {picked.length > 0 ? (
          <ul role="list" className="mt-8 flex flex-col gap-3">
            {picked.map((card) => (
              <li
                key={card.id}
                className="bg-surface-white text-on-white border-fg/10 flex items-baseline justify-between gap-4 rounded-xl border px-5 py-4"
              >
                <span className="text-base font-medium">{card.title}</span>
                <span className="text-on-white-muted text-sm">
                  {card.price.label ? `${card.price.label} ` : ""}
                  {card.price.value}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="text-on-panel-muted mt-8 text-base">{t.compareSoon}</p>
        <a
          href={lang === "ar" ? "/?lang=ar" : "/"}
          className="text-on-panel focus-visible:ring-focus-ring mt-6 inline-block rounded-sm text-sm underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2"
        >
          {t.backToRange}
        </a>
      </div>
    </main>
  );
}
