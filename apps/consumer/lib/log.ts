// Structured logging for the consumer app, the same shape as services/shared/log.ts: one JSON line
// per event, carrying the request's trace id. Callers pass ids, slugs, codes and counts, never a
// visitor's data. The showroom is anonymous, and leads are PII end to end.

export type LogLevel = "info" | "warn" | "error";
export type Logger = (level: LogLevel, event: string, fields?: Record<string, unknown>) => void;

export function logger(service: string, traceId: string): Logger {
  return (level, event, fields = {}) => {
    const line = JSON.stringify({ level, event, service, trace_id: traceId, ...fields });
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    // eslint-disable-next-line no-console -- info lines are the structured log stream (stdout)
    else console.log(line);
  };
}

const TRACE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * The platform's request id when there is one, so app logs join the edge's; else a fresh one.
 * A client can send these headers too, so anything that isn't a short plain token is replaced.
 */
export function traceIdFrom(headers: Pick<Headers, "get">): string {
  for (const name of ["x-vercel-id", "x-request-id"]) {
    const value = headers.get(name);
    if (value && TRACE_ID.test(value)) return value;
  }
  return crypto.randomUUID();
}
