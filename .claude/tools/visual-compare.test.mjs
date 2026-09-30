// Run: node --test .claude/tools/visual-compare.test.mjs
// The comparison tool's confinement: what it will open, serve and write. No browser needed.
import assert from "node:assert/strict";
import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  checkBuiltUrl,
  makeOutDir,
  resolveDesign,
  resolveServed,
  withLang,
} from "./visual-compare.mjs";

/** A throwaway layout: approved/showroom/{brochure.dc.html,support.js}, private/secret.html, outside.txt. */
function layout() {
  const root = mkdtempSync(path.join(os.tmpdir(), "vc-test-"));
  const approved = path.join(root, "approved");
  const folder = path.join(approved, "showroom");
  mkdirSync(path.join(folder, "assets"), { recursive: true });
  mkdirSync(path.join(root, "private"));
  writeFileSync(path.join(folder, "brochure.dc.html"), "<html></html>");
  writeFileSync(path.join(folder, "support.js"), "");
  writeFileSync(path.join(folder, "assets", "car.png"), "");
  writeFileSync(path.join(approved, "other.dc.html"), "");
  writeFileSync(path.join(root, "private", "secret.html"), "");
  writeFileSync(path.join(root, "outside.txt"), "");
  return { root, approved, folder, priv: path.join(root, "private") };
}

const canLink = (target, link, type) => {
  try {
    symlinkSync(target, link, type);
    return true;
  } catch {
    return false;
  }
};

test("resolves <folder>/<name> to the approved file and its own folder", (t) => {
  const l = layout();
  t.after(() => rmSync(l.root, { recursive: true, force: true }));
  const d = resolveDesign("showroom/brochure", l.approved, l.priv);
  assert.equal(path.basename(d.file), "brochure.dc.html");
  assert.equal(path.basename(d.folder), "showroom");
});

test("refuses anything that isn't a plain <folder>/<name>", (t) => {
  const l = layout();
  t.after(() => rmSync(l.root, { recursive: true, force: true }));
  for (const spec of [
    "../private/secret",
    "showroom/../../private/secret",
    "showroom/brochure.dc.html",
    "/etc/passwd",
    "C:/Windows/win",
    "showroom\\brochure",
    "other",
    "showroom/missing",
    "showroom/brochure/x",
    "",
    undefined,
  ]) {
    assert.throws(() => resolveDesign(spec, l.approved, l.priv), undefined, String(spec));
  }
});

test("refuses a design file that is a link, even to another approved file", (t) => {
  const l = layout();
  t.after(() => rmSync(l.root, { recursive: true, force: true }));
  if (!canLink(path.join(l.priv, "secret.html"), path.join(l.folder, "leak.dc.html"), "file"))
    return t.skip("this machine can't create links");
  assert.throws(() => resolveDesign("showroom/leak", l.approved, l.priv));
});

test("refuses approved copies that resolve into the private design folder", (t) => {
  const l = layout();
  t.after(() => rmSync(l.root, { recursive: true, force: true }));
  const fake = path.join(l.root, "approved-link");
  if (!canLink(l.priv, fake, "junction")) return t.skip("this machine can't create links");
  mkdirSync(path.join(l.priv, "showroom"));
  writeFileSync(path.join(l.priv, "showroom", "brochure.dc.html"), "");
  assert.throws(() => resolveDesign("showroom/brochure", fake, l.priv), /private/);
});

test("the design server sends only regular files inside the design's own folder", (t) => {
  const l = layout();
  t.after(() => rmSync(l.root, { recursive: true, force: true }));
  assert.ok(resolveServed(l.folder, "/brochure.dc.html"));
  assert.ok(resolveServed(l.folder, "/support.js?v=1"));
  assert.ok(resolveServed(l.folder, "/assets/car.png"));
  for (const p of [
    "/../other.dc.html",
    "/../../private/secret.html",
    "/%2e%2e/%2e%2e/outside.txt",
    "/..%2f..%2foutside.txt",
    "/..%5c..%5coutside.txt",
    "/assets",
    "/",
    "/missing.js",
    "/%00",
    "/%E0%A4%A",
  ]) {
    assert.equal(resolveServed(l.folder, p), null, p);
  }
});

test("the design server doesn't follow a link out of the folder", (t) => {
  const l = layout();
  t.after(() => rmSync(l.root, { recursive: true, force: true }));
  if (!canLink(l.priv, path.join(l.folder, "escape"), "junction"))
    return t.skip("this machine can't create links");
  assert.equal(resolveServed(l.folder, "/escape/secret.html"), null);
});

test("the built page is loopback http(s) or the https demo host, nothing else", () => {
  for (const ok of [
    "http://localhost:3000/",
    "http://demo.localhost:3000/models/demo-suv?trim=base",
    "http://127.0.0.1:3000",
    "https://demo.auto-verse.net/compare",
  ]) {
    assert.doesNotThrow(() => checkBuiltUrl(ok), ok);
  }
  for (const bad of [
    "file:///C:/x/design/brief.html",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "http://demo.auto-verse.net/",
    "https://evil.example/",
    "http://localhost.evil.example/",
    "http://user:pw@localhost:3000/",
    "ftp://localhost/",
    "not a url",
  ]) {
    assert.throws(() => checkBuiltUrl(bad), undefined, bad);
  }
});

test("Arabic is the same URL with lang=ar", () => {
  assert.equal(
    withLang("http://demo.localhost:3000/?trim=a", "ar"),
    "http://demo.localhost:3000/?trim=a&lang=ar",
  );
  assert.equal(
    withLang("http://demo.localhost:3000/?lang=en", "ar"),
    "http://demo.localhost:3000/?lang=ar",
  );
});

test("a temp folder pointed inside the repository is refused before anything is written", (t) => {
  const l = layout();
  t.after(() => rmSync(l.root, { recursive: true, force: true }));
  // Treat the throwaway layout as "the repo", and its approved folder as a TEMP set inside it.
  assert.throws(() => makeOutDir("showroom/brochure", l.approved, l.root), /inside the repository/);
  assert.throws(() => makeOutDir("showroom/brochure", l.root, l.root), /inside the repository/);
});

test("hard links are neither opened nor served (security review)", (t) => {
  const l = layout();
  t.after(() => rmSync(l.root, { recursive: true, force: true }));
  try {
    linkSync(path.join(l.priv, "secret.html"), path.join(l.folder, "twin.dc.html"));
  } catch {
    return t.skip("this machine can't create hard links");
  }
  assert.throws(() => resolveDesign("showroom/twin", l.approved, l.priv), /hard-linked/);
  assert.equal(resolveServed(l.folder, "/twin.dc.html"), null);
});

test("output goes to a new folder in the OS temp directory, never the repo", (t) => {
  const out = makeOutDir("showroom/brochure");
  t.after(() => rmSync(out, { recursive: true, force: true }));
  // Real paths on both sides: os.tmpdir() can be an 8.3 short name (C:\Users\RUNNER~1 on GitHub's
  // Windows runners), while the tool creates the folder under the real, long path.
  const real = realpathSync.native(out);
  const rel = path.relative(realpathSync.native(os.tmpdir()), real);
  assert.ok(rel && !rel.startsWith("..") && !path.isAbsolute(rel), `${out} is not in temp`);
  const repo = realpathSync.native(path.resolve(import.meta.dirname, "..", ".."));
  // Outside the repo: a relative path that climbs out, or an absolute one (another drive).
  const fromRepo = path.relative(repo, real);
  assert.ok(fromRepo.startsWith("..") || path.isAbsolute(fromRepo), `${out} is in the repo`);
});

test("the served folder may be given in any spelling of its path (short name, junction, case)", (t) => {
  const l = layout();
  t.after(() => rmSync(l.root, { recursive: true, force: true }));
  const brochure = realpathSync.native(path.join(l.folder, "brochure.dc.html"));
  // os.tmpdir() may itself be a short name, so the layout's own spelling is exercised here too.
  assert.equal(resolveServed(l.folder, "/brochure.dc.html"), brochure);
  if (process.platform === "win32") {
    // Windows paths are case-insensitive: an upper-cased folder is the same folder.
    assert.equal(resolveServed(l.folder.toUpperCase(), "/brochure.dc.html"), brochure);
  }
  // A second spelling of the same folder, as an 8.3 short name is: a junction to it.
  const alias = path.join(l.root, "alias");
  if (!canLink(l.folder, alias, "junction")) return t.skip("this machine can't create links");
  assert.equal(resolveServed(alias, "/brochure.dc.html"), brochure);
  assert.ok(resolveServed(alias, "/assets/car.png"));
  // Every refusal still holds from that spelling.
  for (const p of [
    "/../other.dc.html",
    "/../../private/secret.html",
    "/%2e%2e/%2e%2e/outside.txt",
    "/..%5c..%5coutside.txt",
    "/assets",
    "/missing.js",
  ]) {
    assert.equal(resolveServed(alias, p), null, p);
  }
});
