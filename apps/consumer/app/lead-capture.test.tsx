// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LeadClientConfig } from "../lib/lead/config";

// The lead flow end to end in the browser layer: CTA → modal (type and model prefilled) →
// validation → the capture contract (a retry keeps the submission id, each attempt a fresh token)
// → success with the WhatsApp shortcut. capture-lead and Turnstile are stubbed at the network and
// widget boundaries; the contract itself is unit tested in lib/lead/capture.test.ts.

const sentry = vi.hoisted(() => ({ captureMessage: vi.fn() }));
vi.mock("@sentry/nextjs", () => sentry);

const bot = vi.hoisted(() => ({ n: 0, fail: false }));
vi.mock("../lib/lead/turnstile", () => ({
  loadTurnstile: async () => {
    if (bot.fail) throw new Error("turnstile_load_failed");
    return {};
  },
  createBotCheck: () => ({
    getToken: async () => `token-${++bot.n}`,
    destroy: () => {},
  }),
}));

// jsdom lacks what Radix Select needs.
const proto = Element.prototype as unknown as Record<string, unknown>;
proto.hasPointerCapture ??= () => false;
proto.setPointerCapture ??= () => {};
proto.releasePointerCapture ??= () => {};
proto.scrollIntoView ??= () => {};
class Inert {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as Record<string, unknown>).ResizeObserver ??= Inert;

const { LeadButton, LeadCapture } = await import("./lead-capture");

const M = "00000000-0000-4000-8000-0000000000a1";
const T = "00000000-0000-4000-8000-0000000000b1";
const KEY = "pk_" + "A".repeat(32);

const CONFIG: LeadClientConfig = {
  captureUrl: "https://project.supabase.example/functions/v1/capture-lead",
  captureKey: KEY,
  marketCode: "EG",
  siteKey: "1x00000000000000000000AA",
  consentVersion: "eg-v1",
  consentText: "I agree that Demo Motors may contact me about this request.",
  cities: [
    { id: "cairo", label: "Cairo" },
    { id: "giza", label: "Giza" },
  ],
  whatsappHref: "https://wa.me/201000000000",
  brandName: "Demo Motors",
};

function Page() {
  return (
    <LeadCapture
      config={CONFIG}
      lang="en"
      interestOptions={[
        { value: `model:${M}`, label: "Demo SUV" },
        { value: `trim:${T}`, label: "Demo SUV · Sport" },
      ]}
      trimModel={[[T, M]]}
      modelNames={{ [M]: "Demo SUV" }}
    >
      <LeadButton request={{ type: "quote", modelId: M }} label="Request a quote" />
      <LeadButton request={{ type: "test_drive", modelId: M, trimId: T }} label="Test drive" />
    </LeadCapture>
  );
}

function answer(...statuses: number[]) {
  const calls: RequestInit[] = [];
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    calls.push(init);
    return new Response(null, { status: statuses[calls.length - 1] ?? 201 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

async function fillValid(dialog: HTMLElement) {
  await userEvent.type(within(dialog).getByRole("textbox", { name: /Full name/ }), "Mona Adel");
  await userEvent.type(
    within(dialog).getByRole("textbox", { name: /Mobile number/ }),
    "010 1234 5678",
  );
  await userEvent.click(within(dialog).getByRole("combobox", { name: /City/ }));
  await userEvent.click(await screen.findByRole("option", { name: "Cairo" }));
  await userEvent.click(within(dialog).getByRole("checkbox", { name: /I agree/ }));
}

beforeEach(() => {
  bot.n = 0;
  bot.fail = false;
  sentry.captureMessage.mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LeadCapture", () => {
  it("a section CTA opens a quote request with its model prefilled", async () => {
    render(<Page />);
    await userEvent.click(screen.getByRole("button", { name: "Request a quote" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName("Demo SUV");
    expect(within(dialog).getByText("Request a quote")).toBeInTheDocument();
    expect(within(dialog).getByRole("combobox", { name: /Model of interest/ })).toHaveTextContent(
      "Demo SUV",
    );
    expect(
      within(dialog).getByRole("checkbox", { name: /Demo Motors may contact me/ }),
    ).toBeInTheDocument();
  });

  it("an invalid submit sends nothing, shows every error and focuses the first", async () => {
    const calls = answer(201);
    render(<Page />);
    await userEvent.click(screen.getByRole("button", { name: "Request a quote" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByRole("textbox", { name: /Mobile number/ }), "123");
    await userEvent.click(within(dialog).getByRole("button", { name: "Send request" }));
    expect(calls).toHaveLength(0);
    const name = within(dialog).getByRole("textbox", { name: /Full name/ });
    expect(name).toHaveFocus();
    expect(name).toHaveAccessibleDescription("Enter your full name.");
    expect(within(dialog).getByRole("textbox", { name: /Mobile number/ })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(within(dialog).getByRole("combobox", { name: /City/ })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(within(dialog).getByRole("checkbox")).toHaveAttribute("aria-invalid", "true");
  });

  it("503 then 201: one submission id, a fresh token per attempt, then success with WhatsApp", async () => {
    const calls = answer(503, 201);
    render(<Page />);
    await userEvent.click(screen.getByRole("button", { name: "Test drive" }));
    const dialog = screen.getByRole("dialog");
    await fillValid(dialog);
    await userEvent.click(within(dialog).getByRole("button", { name: "Send request" }));

    await waitFor(
      () => expect(screen.getByRole("heading", { name: "Request received" })).toBeInTheDocument(),
      {
        timeout: 4000,
      },
    );
    expect(calls).toHaveLength(2);
    const bodies = calls.map((c) => JSON.parse(String(c.body)) as Record<string, unknown>);
    expect(bodies[0]!.submission_id).toBe(bodies[1]!.submission_id);
    expect(bodies.map((b) => b.turnstile_token)).toEqual(["token-1", "token-2"]);
    expect(bodies[0]).toMatchObject({
      full_name: "Mona Adel",
      phone: "+201012345678",
      city: "cairo",
      model_id: M,
      trim_id: T,
      type: "test_drive",
      preferred_time: "this_week",
      consent_text_version: "eg-v1",
    });
    expect(typeof bodies[0]!.consent_at).toBe("string");
    const headers = calls[0]!.headers as Record<string, string>;
    expect(headers["x-autoverse-key"]).toBe(KEY);
    expect(headers["x-autoverse-market"]).toBe("EG");
    expect(screen.getByRole("link", { name: /WhatsApp/ })).toHaveAttribute(
      "href",
      "https://wa.me/201000000000",
    );
    expect(sentry.captureMessage).not.toHaveBeenCalled();
  }, 10_000);

  it("429: a readable state, the form kept, and a report that carries no PII", async () => {
    answer(429);
    render(<Page />);
    await userEvent.click(screen.getByRole("button", { name: "Request a quote" }));
    const dialog = screen.getByRole("dialog");
    await fillValid(dialog);
    await userEvent.click(within(dialog).getByRole("button", { name: "Send request" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/Too many requests/);
    expect(within(dialog).getByRole("textbox", { name: /Full name/ })).toHaveValue("Mona Adel");
    expect(sentry.captureMessage).toHaveBeenCalledWith(
      "lead_submit_failed",
      expect.objectContaining({ tags: expect.objectContaining({ outcome: "rate_limited" }) }),
    );
    const report = JSON.stringify(sentry.captureMessage.mock.calls);
    expect(report).not.toMatch(/Mona|1012345678|cairo/);
  });

  it("a changed request after a failure gets a new submission id; an unchanged retry keeps it", async () => {
    const calls = answer(422, 422, 201);
    render(<Page />);
    await userEvent.click(screen.getByRole("button", { name: "Request a quote" }));
    const dialog = screen.getByRole("dialog");
    await fillValid(dialog);
    const send = () =>
      userEvent.click(within(dialog).getByRole("button", { name: "Send request" }));
    await send();
    await within(dialog).findByRole("alert");
    await send(); // the same request again
    await waitFor(() => expect(calls).toHaveLength(2));
    await userEvent.type(within(dialog).getByRole("textbox", { name: /Full name/ }), " Hassan");
    await send(); // a different request
    await waitFor(() => expect(calls).toHaveLength(3));
    const ids = calls.map(
      (c) => (JSON.parse(String(c.body)) as { submission_id: string }).submission_id,
    );
    expect(ids[0]).toBe(ids[1]);
    expect(ids[2]).not.toBe(ids[1]);
  });

  it("while sending, the modal can't be closed (Escape and the close button), so retries keep their tokens", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const calls: RequestInit[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init: RequestInit) => {
        calls.push(init);
        await gate;
        return new Response(null, { status: 201 });
      }),
    );
    render(<Page />);
    await userEvent.click(screen.getByRole("button", { name: "Request a quote" }));
    const dialog = screen.getByRole("dialog");
    await fillValid(dialog);
    await userEvent.click(within(dialog).getByRole("button", { name: "Send request" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(within(dialog).getByRole("button", { name: "Close" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    release();
    expect(await screen.findByRole("heading", { name: "Request received" })).toBeInTheDocument();
  });

  it("a double submit sends one request", async () => {
    const calls = answer(201, 201);
    render(<Page />);
    await userEvent.click(screen.getByRole("button", { name: "Request a quote" }));
    const dialog = screen.getByRole("dialog");
    await fillValid(dialog);
    const form = dialog.querySelector("form")!;
    form.requestSubmit();
    form.requestSubmit();
    expect(await screen.findByRole("heading", { name: "Request received" })).toBeInTheDocument();
    expect(calls).toHaveLength(1);
  });

  it("409: says so, and the next submit is a new request with a new submission id", async () => {
    const calls = answer(409, 201);
    render(<Page />);
    await userEvent.click(screen.getByRole("button", { name: "Request a quote" }));
    const dialog = screen.getByRole("dialog");
    await fillValid(dialog);
    const send = () =>
      userEvent.click(within(dialog).getByRole("button", { name: "Send request" }));
    await send();
    expect(await within(dialog).findByText(/already sent/)).toBeInTheDocument();
    await send();
    expect(await screen.findByRole("heading", { name: "Request received" })).toBeInTheDocument();
    const ids = calls.map(
      (c) => (JSON.parse(String(c.body)) as { submission_id: string }).submission_id,
    );
    expect(ids[1]).not.toBe(ids[0]);
  });

  it("the bot check fails to load: nothing is sent, the visitor is told, and it is reported", async () => {
    bot.fail = true;
    const calls = answer(201);
    render(<Page />);
    await userEvent.click(screen.getByRole("button", { name: "Request a quote" }));
    const dialog = screen.getByRole("dialog");
    await fillValid(dialog);
    await userEvent.click(within(dialog).getByRole("button", { name: "Send request" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/couldn't verify/);
    expect(calls).toHaveLength(0);
    expect(sentry.captureMessage).toHaveBeenCalledWith(
      "lead_bot_check_unavailable",
      expect.anything(),
    );
    expect(sentry.captureMessage).toHaveBeenCalledWith(
      "lead_submit_failed",
      expect.objectContaining({
        tags: expect.objectContaining({ outcome: "verification_failed" }),
      }),
    );
  });
});
