import { describe, expect, it } from "vitest";
import { subdomainFromHost } from "./host";

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
