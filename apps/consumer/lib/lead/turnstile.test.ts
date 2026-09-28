// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createBotCheck, type TurnstileApi } from "./turnstile";

type Options = Parameters<TurnstileApi["render"]>[1];

function fakeApi() {
  let options: Options | null = null;
  let solved = 0;
  const api = {
    render: vi.fn((_el: HTMLElement, o: Options) => {
      options = o;
      return "widget-1";
    }),
    reset: vi.fn(),
    execute: vi.fn(() => {
      // Cloudflare answers asynchronously with a new token each time.
      queueMicrotask(() => options?.callback?.(`token-${++solved}`));
    }),
    remove: vi.fn(),
  } satisfies TurnstileApi;
  return { api, options: () => options! };
}

describe("createBotCheck", () => {
  it("renders once, invisible unless needed, executed on demand, never auto-refreshed", () => {
    const { api, options } = fakeApi();
    createBotCheck(api, document.createElement("div"), "site-key", "ar");
    expect(api.render).toHaveBeenCalledOnce();
    expect(options()).toMatchObject({
      sitekey: "site-key",
      action: "lead",
      language: "ar",
      execution: "execute",
      appearance: "interaction-only",
      "refresh-expired": "manual",
    });
  });

  it("hands out a FRESH token per call: reset, then execute", async () => {
    const { api } = fakeApi();
    const check = createBotCheck(api, document.createElement("div"), "k", "en");
    expect(await check.getToken()).toBe("token-1");
    expect(await check.getToken()).toBe("token-2");
    expect(api.reset).toHaveBeenCalledTimes(2);
    expect(api.execute).toHaveBeenCalledTimes(2);
  });

  it("an error, an expiry or a timeout gives null", async () => {
    const { api, options } = fakeApi();
    api.execute.mockImplementation(() => queueMicrotask(() => options()["error-callback"]?.("x")));
    const check = createBotCheck(api, document.createElement("div"), "k", "en");
    expect(await check.getToken()).toBeNull();

    api.execute.mockImplementation(() => {});
    const slow = createBotCheck(api, document.createElement("div"), "k", "en", 5);
    expect(await slow.getToken()).toBeNull();
  });

  it("destroy removes the widget", () => {
    const { api } = fakeApi();
    createBotCheck(api, document.createElement("div"), "k", "en").destroy();
    expect(api.remove).toHaveBeenCalledWith("widget-1");
  });
});
