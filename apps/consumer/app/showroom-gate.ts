import * as Sentry from "@sentry/nextjs";
import { headers } from "next/headers";
import { FLAGS, isFlagEnabled } from "../lib/flags";
import { logger, traceIdFrom, type Logger } from "../lib/log";
import { previewSubdomain } from "../lib/showroom/host";
import { loadShowroomPage, type LoadOutcome } from "../lib/showroom/load";
import { configuredCatalogSource } from "../lib/showroom/source";

// One gate for every showroom route (the showroom at "/", the compare placeholder): host →
// brand-market → `page_showroom` → catalogue. Shared, so the routes can never drift apart on who
// gets in. The caller decides what a "no" is (the brand-neutral 404) and adds its own flags.

export interface GatedShowroom {
  outcome: LoadOutcome;
  traceId: string;
  log: Logger;
}

export async function loadGatedShowroom(service: string): Promise<GatedShowroom> {
  const h = await headers();
  const traceId = traceIdFrom(h);
  // One trace id end to end: our log lines, the flag's failure log, and any Sentry report.
  Sentry.getIsolationScope().setTag("trace_id", traceId);
  const log = logger(service, traceId);
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
  return { outcome, traceId, log };
}
