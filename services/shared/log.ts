// One structured logger for every edge function: one JSON line per event, with the service name.
// Callers pass ids, kinds, codes and counts. Never a payload: leads are PII end to end.

export type LogLevel = "info" | "warn" | "error";
export type Logger = (level: LogLevel, event: string, fields?: Record<string, unknown>) => void;

export function logger(service: string): Logger {
  return (level, event, fields = {}) => {
    const line = JSON.stringify({ level, event, service, ...fields });
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    // eslint-disable-next-line no-console -- info lines are the structured log stream (stdout)
    else console.log(line);
  };
}

/**
 * Read required configuration. A missing value is a deploy mistake, not an attack. The caller
 * answers 503 and logs `<service>_misconfigured` naming the variable (never its value).
 */
export function requireEnv(
  read: (name: string) => string | undefined,
  names: readonly string[],
): { ok: true; values: Record<string, string> } | { ok: false; missing: string[] } {
  const values: Record<string, string> = {};
  const missing: string[] = [];
  for (const name of names) {
    const value = read(name);
    if (value) values[name] = value;
    else missing.push(name);
  }
  return missing.length > 0 ? { ok: false, missing } : { ok: true, values };
}

/** Reject after `ms`. Used where a client library takes no AbortSignal (e.g. auth.getUser). */
export function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
