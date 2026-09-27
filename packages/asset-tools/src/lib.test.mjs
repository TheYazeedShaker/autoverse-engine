import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  assertTransparentBackground,
  carBoundingBox,
  normaliseMaster,
  objectName,
  parseMasterPath,
  registrationSql,
  sideDirection,
  STANDARD_WIDTH,
} from "./lib.mjs";

// Synthetic side silhouettes on a transparent 800×300 canvas: no real vehicle imagery.
// An SUV facing RIGHT: tall tail on the left, the cabin sloping down to a low bonnet on the right.
const SUV_RIGHT = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="300">
  <polygon fill="black" points="40,260 40,70 520,60 640,150 760,160 760,260" />
</svg>`;
const SUV_LEFT = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="300">
  <g transform="translate(800,0) scale(-1,1)">
    <polygon fill="black" points="40,260 40,70 520,60 640,150 760,160 760,260" />
  </g>
</svg>`;
const BOX = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="300">
  <rect fill="black" x="40" y="100" width="720" height="160" />
</svg>`;
const png = (svg) => sharp(Buffer.from(svg)).png().toBuffer();

describe("parseMasterPath", () => {
  it("reads <model>/<trim>-<view>[.hash8].<ext>", () => {
    expect(parseMasterPath("lyriq/signature-luxury-side.png")).toEqual({
      model: "lyriq",
      trim: "signature-luxury",
      view: "side",
      ext: "png",
    });
    expect(parseMasterPath("escalade-ice\\1sh-front-34.a1b2c3d4.webp")).toEqual({
      model: "escalade-ice",
      trim: "1sh",
      view: "front-34",
      ext: "webp",
    });
  });

  it("refuses anything else, with the reason", () => {
    expect(() => parseMasterPath("lyriq/signature-luxury-rear.png")).toThrow(/side\|front-34/);
    expect(() => parseMasterPath("signature-luxury-side.png")).toThrow(/expected/);
    expect(() => parseMasterPath("Lyriq/x-side.png")).toThrow(/model slug/);
    expect(() => parseMasterPath("lyriq/x-side.jpg")).toThrow();
    expect(() => parseMasterPath("../etc/x-side.png")).toThrow();
  });
});

describe("objectName", () => {
  it("is {brand}/{model}/{trim}-{view}.{hash8}.{ext}, and the hash follows the content", () => {
    const parsed = { model: "lyriq", trim: "signature-luxury", view: "side" };
    const a = objectName("demo", parsed, Buffer.from("one"));
    const b = objectName("demo", parsed, Buffer.from("two"));
    expect(a).toMatch(/^demo\/lyriq\/signature-luxury-side\.[0-9a-f]{8}\.png$/);
    expect(a).not.toBe(b);
    expect(objectName("demo", parsed, Buffer.from("one"))).toBe(a);
  });
});

describe("sideDirection", () => {
  it("reads a right-facing car as right (low bonnet end on the right)", async () => {
    expect((await sideDirection(await png(SUV_RIGHT))).direction).toBe("right");
  });

  it("flags a left-facing car as a strong left (an error in normalize, unless confirmed by eye)", async () => {
    expect((await sideDirection(await png(SUV_LEFT))).direction).toBe("left");
  });

  it("says uncertain when the two ends are too close to call", async () => {
    expect((await sideDirection(await png(BOX))).direction).toBe("uncertain");
  });
});

describe("assertTransparentBackground", () => {
  it("accepts a master on a transparent background", async () => {
    await expect(assertTransparentBackground(await png(SUV_RIGHT))).resolves.toBeUndefined();
  });

  it("rejects an opaque master: its background would sit inside every frame", async () => {
    const opaque = await sharp(Buffer.from(SUV_RIGHT)).flatten({ background: "#ffffff" }).png().toBuffer();
    await expect(assertTransparentBackground(opaque)).rejects.toThrow(/alpha channel|transparent/);
    const onWhite = await sharp(Buffer.from(SUV_RIGHT)).flatten({ background: "#ffffff" }).ensureAlpha().png().toBuffer();
    await expect(assertTransparentBackground(onWhite)).rejects.toThrow(/corners are not transparent/);
  });
});

describe("carBoundingBox", () => {
  it("ignores a faint baked-in shadow, so every car's box is the car", async () => {
    const withShadow = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="300">
      <rect fill="black" fill-opacity="0.03" x="0" y="250" width="800" height="50" />
      <rect fill="black" x="40" y="100" width="720" height="160" />
    </svg>`;
    expect(await carBoundingBox(await png(withShadow))).toEqual({ left: 40, top: 100, width: 720, height: 160 });
  });
});

describe("normaliseMaster", () => {
  it("flags a master that had to be enlarged", async () => {
    const { upscaled } = await normaliseMaster(await png(BOX), "side");
    expect(upscaled).toBe(true);
  });

  it("trims transparent margins tight to the car, then scales to the standard width", async () => {
    // The box is 720×160 inside an 800×300 canvas: margins go, then 720 → 1920 wide.
    const { width, height, data } = await normaliseMaster(await png(BOX), "side");
    expect(width).toBe(STANDARD_WIDTH.side);
    expect(height).toBe(Math.round((160 * 1920) / 720));
    const meta = await sharp(data).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([width, height, "png"]);
  });
});

describe("registrationSql", () => {
  const sql = registrationSql("demo", [
    { model: "lyriq", trim: "signature-luxury", view: "side", publicPath: "demo/lyriq/signature-luxury-side.a1b2c3d4.png", width: 1920, height: 700 },
  ]);

  it("updates the one row per (trim, view) in place, or inserts it, inside a transaction", () => {
    expect(sql).toContain("begin;");
    expect(sql).toContain("commit;");
    expect(sql).toContain("public_path = 'demo/lyriq/signature-luxury-side.a1b2c3d4.png'");
    expect(sql).toContain("width = 1920, height = 700");
    // An update keeps the row's storage_path; only an insert records one (masters/ + the name).
    expect(sql.split("update public.assets")[1].split(";")[0]).not.toContain("storage_path");
    expect(sql).toContain("'masters/demo/lyriq/signature-luxury-side.a1b2c3d4.png'");
    expect(sql).toMatch(/if n = 0 then[\s\S]*?insert into public\.assets/);
    expect(sql).toContain("raise exception 'trim % not found'");
  });

  it("escapes quotes in literals", () => {
    expect(registrationSql("demo", [{ model: "o'x", trim: "t", view: "side", publicPath: "p", width: 1, height: 1 }])).toContain("'o''x'");
  });
});
