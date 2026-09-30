#!/usr/bin/env node
// The visual self-check (working rule B, CLAUDE.md; ADR 0010, "Visual comparison tool").
//
// The ONE program with shell-side read access to the approved design copies. It is owner-controlled:
// it lives in .claude/tools/, which the agent can't edit (settings.json deny rules + the guard), and
// the guard lets it run only as `pnpm visual:compare`, with that package script pinned to this file.
//
//   pnpm visual:compare <folder>/<name> --built <url>
//
//   <folder>/<name>  an approved design: design-approved/<folder>/<name>.dc.html, e.g. showroom/brochure
//   --built <url>    the built page. http(s) on localhost, *.localhost or 127.0.0.1, or https on the
//                    demo host. Arabic is the same URL with lang=ar.
//
// It renders the design and the built page at 390, 768 and 1440 px, in EN and AR, full page, with
// reduced motion (so frames are stable), and writes the PNGs, an index.html (side by side) and a
// summary.json to a new folder in the OS temp directory. It prints that folder. Never the repo: the
// design renders carry real brand content, and the repository is public (ADR 0008).
//
// Read-only by construction:
// - The design is served over HTTP from 127.0.0.1 by an in-process server that answers GET/HEAD only,
//   and only for regular files inside that design's own folder (resolved through symlinks). The
//   browser never gets a file:// URL, so nothing else on disk is reachable from the page.
// - The design page may fetch only its own server and the font hosts; every other request is aborted.
// - The script writes nothing except its temp output folder.
import {
  createReadStream,
  lstatSync,
  mkdtempSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const REPO = path.resolve(import.meta.dirname, "..", "..");

export const WIDTHS = [390, 768, 1440];
export const LANGS = ["en", "ar"];
/** The stable demo address (BACKLOG #18), https only. */
export const DEMO_HOSTS = ["demo.auto-verse.net"];
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];
const DESIGN_NAME = /^[a-z0-9-]+\/[A-Za-z0-9-]+$/;

const inside = (root, p) => {
  const rel = path.relative(root, p);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
};

/**
 * `<folder>/<name>` → the design file and the folder it may load from, both real paths inside the
 * approved copies. Refuses anything else: paths, `..`, links out, and an approved folder that is
 * itself a link into the owner's private design/ folder.
 */
export function resolveDesign(spec, approvedRoot, privateRoot) {
  if (typeof spec !== "string" || !DESIGN_NAME.test(spec))
    throw new Error(`the design must be <folder>/<name>, e.g. showroom/brochure (got ${spec})`);
  const approved = realpathSync.native(approvedRoot);
  let priv = null;
  try {
    priv = realpathSync.native(privateRoot);
  } catch {
    // no private folder on this machine
  }
  if (priv && (inside(priv, approved) || inside(approved, priv)))
    throw new Error("the approved copies resolve into the private design folder");
  const file = path.join(approved, `${spec}.dc.html`);
  let link;
  try {
    link = lstatSync(file);
  } catch {
    throw new Error(`no approved design ${spec}`);
  }
  if (!link.isFile()) throw new Error(`${spec} is not a regular file (a link or a folder)`);
  if (link.nlink > 1) throw new Error(`${spec} is hard-linked elsewhere; the owner copies files`);
  const real = realpathSync.native(file);
  const folder = path.dirname(real);
  if (!inside(approved, real) || !inside(approved, folder))
    throw new Error(`${spec} resolves outside the approved copies`);
  return { file: real, folder };
}

/** A URL path the design server was asked for → the real file it may send, or null. */
export function resolveServed(folder, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split("?")[0]);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const p = path.resolve(folder, `.${decoded.startsWith("/") ? decoded : `/${decoded}`}`);
  if (!inside(folder, p)) return null;
  let real;
  try {
    real = realpathSync.native(p);
  } catch {
    return null;
  }
  if (!inside(folder, real)) return null;
  try {
    const st = statSync(real);
    // A hard link shares its content with a file elsewhere: never served.
    return st.isFile() && st.nlink === 1 ? real : null;
  } catch {
    return null;
  }
}

/** The built page's URL: http(s) on a loopback name, or https on the demo host. Nothing else. */
export function checkBuiltUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`--built is not a URL: ${raw}`);
  }
  if (u.username || u.password) throw new Error("--built must not carry credentials");
  const h = u.hostname;
  const loopback =
    h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h.endsWith(".localhost");
  if (loopback && /^https?:$/.test(u.protocol)) return u;
  if (u.protocol === "https:" && DEMO_HOSTS.includes(h)) return u;
  throw new Error(
    `--built must be http(s) on localhost or https on ${DEMO_HOSTS.join(", ")} (got ${raw})`,
  );
}

export function withLang(url, lang) {
  const u = new URL(url);
  u.searchParams.set("lang", lang);
  return u.href;
}

/**
 * The output folder: always a new folder in the OS temp directory, and never inside the repository
 * (TEMP/TMP can be pointed anywhere, so the base is checked before anything is created).
 */
export function makeOutDir(spec, base = os.tmpdir(), repo = REPO) {
  let realBase;
  try {
    realBase = realpathSync.native(base);
  } catch {
    throw new Error(`the temp folder ${base} doesn't exist`);
  }
  if (inside(realpathSync.native(repo), realBase))
    throw new Error(`the temp folder ${base} is inside the repository; set TEMP/TMP elsewhere`);
  return mkdtempSync(path.join(realBase, `autoverse-visual-${spec.replace("/", "-")}-`));
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
};

function serveDesign(folder) {
  const server = http.createServer((req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405).end();
      return;
    }
    const file = resolveServed(folder, req.url ?? "/");
    if (!file) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      "content-type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    if (req.method === "HEAD") res.end();
    else createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

/** The approved pages switch language with their own EN/AR control. */
async function designToArabic(page) {
  for (const name of [/^عربي$/, /^العربية$/, /^AR$/]) {
    const control = page.getByRole("button", { name }).or(page.getByText(name)).first();
    if (await control.isVisible().catch(() => false)) {
      await control.click();
      return true;
    }
  }
  return false;
}

async function main(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: { built: { type: "string" } },
  });
  if (positionals.length !== 1 || !values.built) {
    throw new Error("usage: pnpm visual:compare <folder>/<name> --built <url>");
  }
  const spec = positionals[0];
  const design = resolveDesign(spec, path.join(REPO, "design-approved"), path.join(REPO, "design"));
  const built = checkBuiltUrl(values.built);
  const out = makeOutDir(spec);
  const notes = [];

  const { chromium } = await import("playwright");
  const server = await serveDesign(design.folder);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const shots = [];
  try {
    for (const width of WIDTHS) {
      for (const lang of LANGS) {
        // One context per side. No service workers and no downloads in either; the design's context
        // is routed as a whole (popups included) to its own server and the font hosts.
        const options = {
          viewport: { width, height: 900 },
          deviceScaleFactor: 1,
          reducedMotion: "reduce",
          serviceWorkers: "block",
          acceptDownloads: false,
        };
        const designContext = await browser.newContext(options);
        const builtContext = await browser.newContext(options);
        try {
          await designContext.route("**/*", (route) => {
            const u = new URL(route.request().url());
            const own = u.origin === origin;
            const font = u.protocol === "https:" && FONT_HOSTS.includes(u.hostname);
            return own || font ? route.continue() : route.abort();
          });
          const page = await designContext.newPage();
          await page.goto(`${origin}/${path.basename(design.file)}`, { waitUntil: "load" });
          if (lang === "ar" && !(await designToArabic(page)))
            notes.push(`${width}px: the design has no visible AR control; its AR shot is EN`);
          await settle(page);
          const d = `design-${width}-${lang}.png`;
          await page.screenshot({ path: path.join(out, d), fullPage: true });

          const builtPage = await builtContext.newPage();
          await builtPage.goto(withLang(built.href, lang), { waitUntil: "networkidle" });
          await settle(builtPage);
          const b = `built-${width}-${lang}.png`;
          await builtPage.screenshot({ path: path.join(out, b), fullPage: true });
          shots.push({ width, lang, design: d, built: b });
        } finally {
          await designContext.close();
          await builtContext.close();
        }
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  const rows = shots
    .map(
      (s) =>
        `<h2>${s.width}px · ${s.lang.toUpperCase()}</h2><div class="pair"><figure><figcaption>Design</figcaption><img src="${s.design}"></figure><figure><figcaption>Built</figcaption><img src="${s.built}"></figure></div>`,
    )
    .join("\n");
  writeFileSync(
    path.join(out, "index.html"),
    `<!doctype html><meta charset="utf-8"><title>${spec}: design vs built</title><style>body{font:14px system-ui;margin:16px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}img{width:100%;border:1px solid #ccc}</style><h1>${spec}: design vs built</h1>${rows}`,
  );
  writeFileSync(
    path.join(out, "summary.json"),
    JSON.stringify({ design: spec, built: built.href, shots, notes }, null, 2),
  );
  process.stdout.write(`${out}\n`);
  for (const n of notes) process.stderr.write(`note: ${n}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`visual:compare: ${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  });
}
