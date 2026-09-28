import { cleanup, render, screen, within } from "@testing-library/react";
import { axe } from "jest-axe";
import { afterEach, describe, expect, it } from "vitest";
import { TopBar, type TopBarProps } from "./TopBar";

afterEach(cleanup);

const props = (lang: "en" | "ar" = "en"): TopBarProps => ({
  brandName: "Demo Motors",
  marketLabel: "EG · EGP",
  languageLabel: lang === "ar" ? "اللغة" : "Language",
  languages: [
    { code: "en", label: "EN", href: "?lang=en", current: lang === "en" },
    { code: "ar", label: "عربي", href: "?lang=ar", current: lang === "ar" },
  ],
  bookTestDrive: { label: lang === "ar" ? "احجز تجربة قيادة" : "Book a test drive" },
});

describe("TopBar", () => {
  it("is the page banner with the brand wordmark and the market chip", () => {
    render(<TopBar {...props()} />);
    const banner = screen.getByRole("banner");
    expect(within(banner).getByText("Demo Motors")).toBeInTheDocument();
    expect(within(banner).getByText("EG · EGP")).toBeInTheDocument();
  });

  it("uses the logo slot when the brand has one", () => {
    render(<TopBar {...props()} logo={<img src="/logo.svg" alt="Demo Motors" />} />);
    expect(screen.getByRole("img", { name: "Demo Motors" })).toBeInTheDocument();
    expect(screen.queryByText("Demo Motors", { selector: "span" })).toBeNull();
  });

  it("switches language with plain links (hreflang, lang, aria-current)", () => {
    render(<TopBar {...props("ar")} />);
    const nav = screen.getByRole("navigation", { name: "اللغة" });
    const [en, ar] = within(nav).getAllByRole("link");
    expect(en).toHaveAttribute("href", "?lang=en");
    expect(en).toHaveAttribute("hreflang", "en");
    expect(en).not.toHaveAttribute("aria-current");
    expect(ar).toHaveAttribute("lang", "ar");
    expect(ar).toHaveAttribute("aria-current", "true");
  });

  it("'Book a test drive' is disabled until the lead modal exists (slice 7)", () => {
    render(<TopBar {...props()} />);
    expect(screen.getByRole("button", { name: "Book a test drive" })).toBeDisabled();
    cleanup();
    render(
      <TopBar {...props()} bookTestDrive={{ label: "Book a test drive", onClick: () => {} }} />,
    );
    expect(screen.getByRole("button", { name: "Book a test drive" })).toBeEnabled();
  });

  it("takes its height from the top-bar token (the hero subtracts the same)", () => {
    render(<TopBar {...props()} />);
    expect(screen.getByRole("banner")).toHaveClass("h-(--av-topbar-height)");
  });

  it("has no axe violations, in both directions", async () => {
    const { container } = render(<TopBar {...props()} />);
    expect(await axe(container)).toHaveNoViolations();
    cleanup();
    const rtl = render(
      <div dir="rtl" lang="ar">
        <TopBar {...props("ar")} />
      </div>,
    ).container;
    expect(await axe(rtl)).toHaveNoViolations();
  });
});
