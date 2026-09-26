import { describe, expect, it } from "vitest";
import { isVercelPreviewHost, previewSubdomain, subdomainFromHost } from "./host";

describe("subdomainFromHost", () => {
  it("takes the one label in front of the configured root", () => {
    expect(subdomainFromHost("demo.example.test", "example.test")).toBe("demo");
    expect(subdomainFromHost("demo-eg.example.test", "example.test")).toBe("demo-eg");
  });

  it("ignores case, the port and a trailing dot", () => {
    expect(subdomainFromHost("Demo.Example.Test:3000", "example.test")).toBe("demo");
    expect(subdomainFromHost("demo.example.test.", "example.test")).toBe("demo");
    expect(subdomainFromHost("demo.localhost:3000", "localhost")).toBe("demo");
  });

  it("resolves nothing for the bare root, a foreign host or a look-alike", () => {
    expect(subdomainFromHost("example.test", "example.test")).toBeNull();
    expect(subdomainFromHost("demo.other.test", "example.test")).toBeNull();
    expect(subdomainFromHost("demo.notexample.test", "example.test")).toBeNull();
    expect(subdomainFromHost("demoexample.test", "example.test")).toBeNull();
  });

  it("refuses more than one label, so a nested host can't pose as a brand", () => {
    expect(subdomainFromHost("a.demo.example.test", "example.test")).toBeNull();
  });

  it("refuses labels DNS would not allow", () => {
    expect(subdomainFromHost("-demo.example.test", "example.test")).toBeNull();
    expect(subdomainFromHost("de_mo.example.test", "example.test")).toBeNull();
    expect(subdomainFromHost(`${"a".repeat(64)}.example.test`, "example.test")).toBeNull();
  });

  it("resolves nothing without a host or a configured root", () => {
    expect(subdomainFromHost(null, "example.test")).toBeNull();
    expect(subdomainFromHost("demo.example.test", undefined)).toBeNull();
    expect(subdomainFromHost("demo.example.test", " ")).toBeNull();
  });
});

describe("the Vercel preview demo path", () => {
  it("applies only on a Vercel preview, with a valid label", () => {
    expect(previewSubdomain({ VERCEL_ENV: "preview", SHOWROOM_PREVIEW_SUBDOMAIN: "demo" })).toBe(
      "demo",
    );
    expect(
      previewSubdomain({ VERCEL_ENV: "production", SHOWROOM_PREVIEW_SUBDOMAIN: "demo" }),
    ).toBeNull();
    expect(
      previewSubdomain({ VERCEL_ENV: "development", SHOWROOM_PREVIEW_SUBDOMAIN: "demo" }),
    ).toBeNull();
    expect(previewSubdomain({ SHOWROOM_PREVIEW_SUBDOMAIN: "demo" })).toBeNull();
    expect(previewSubdomain({ VERCEL_ENV: "preview" })).toBeNull();
    expect(
      previewSubdomain({ VERCEL_ENV: "preview", SHOWROOM_PREVIEW_SUBDOMAIN: "Demo.x" }),
    ).toBeNull();
  });

  it("recognises only single-label *.vercel.app hosts", () => {
    expect(isVercelPreviewHost("consumer-git-feat-x-team.vercel.app")).toBe(true);
    expect(isVercelPreviewHost("Consumer-abc123-team.VERCEL.app:443")).toBe(true);
    expect(isVercelPreviewHost("demo.example.test")).toBe(false);
    expect(isVercelPreviewHost("a.b.vercel.app")).toBe(false);
    expect(isVercelPreviewHost("vercel.app.evil.test")).toBe(false);
    expect(isVercelPreviewHost(null)).toBe(false);
  });
});
