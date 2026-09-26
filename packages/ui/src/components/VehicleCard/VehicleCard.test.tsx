import { render, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";
import { VehicleCard, type VehicleCardProps } from "./VehicleCard";

// Fictional demo data only (no real manufacturer).
const base: VehicleCardProps = {
  year: "2026",
  badge: "EV",
  title: "Aurora GT Long Range",
  attributes: [
    { icon: "fuel", label: "Electric" },
    { icon: "drive", label: "AWD" },
    { icon: "transmission", label: "Single-speed" },
  ],
  image: <img src="/car.png" alt="Aurora GT, side view" />,
  imagePlaceholderLabel: "Image coming soon",
  highlightsLabel: "Technical highlights",
  stats: [
    { icon: "accel", value: "4.9", unit: "s", label: "0–100 km/h" },
    { icon: "power", value: "500", unit: "hp", label: "Power" },
    { icon: "top-speed", value: "210", unit: "km/h", label: "Top speed" },
  ],
  details: [
    { icon: "battery", label: "Electric range", value: "480 km" },
    { icon: "seats", label: "Seating capacity", value: "5 seats" },
  ],
  configure: { label: "Configure", href: "/configure/aurora-gt" },
  explore: { label: "Explore in detail", href: "/aurora-gt" },
  price: { label: "From", value: "EGP 3,900,000" },
};

const card = (over: Partial<VehicleCardProps> = {}) =>
  render(<VehicleCard {...base} {...over} />).container;

describe("VehicleCard", () => {
  it("is an article named by its title, with year, badge and attributes", () => {
    const c = card();
    const article = within(c).getByRole("article", { name: "Aurora GT Long Range" });
    expect(within(article).getByRole("heading", { level: 3 })).toHaveTextContent(
      "Aurora GT Long Range",
    );
    expect(within(article).getByText("2026")).toBeInTheDocument();
    expect(within(article).getByText("EV")).toBeInTheDocument();
    expect(
      within(article)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Electric", "AWD", "Single-speed"]);
  });

  it("lists the headline stats and details as term/definition pairs", () => {
    const c = card();
    const panel = within(c).getByRole("region", { name: "Technical highlights" });
    const terms = within(panel)
      .getAllByRole("term")
      .map((t) => t.textContent);
    expect(terms).toEqual([
      "0–100 km/h",
      "Power",
      "Top speed",
      "Electric range",
      "Seating capacity",
    ]);
    expect(within(panel).getByText("480 km")).toBeInTheDocument();
  });

  it("shows the image slot, or the designed placeholder when there is no image", () => {
    expect(within(card()).getByRole("img", { name: "Aurora GT, side view" })).toBeInTheDocument();
    const empty = card({ image: null });
    expect(within(empty).getByRole("img", { name: "Image coming soon" })).toBeInTheDocument();
  });

  it("links Configure (the brand accent) and Explore when they have a destination", () => {
    const c = card();
    const configure = within(c).getByRole("link", { name: "Configure" });
    expect(configure).toHaveAttribute("href", "/configure/aurora-gt");
    expect(configure).toHaveClass("bg-accent", "text-on-accent");
    expect(within(c).getByRole("link", { name: "Explore in detail" })).toHaveAttribute(
      "href",
      "/aurora-gt",
    );
  });

  it("disables an action honestly when its page doesn't exist yet", () => {
    const c = card({ configure: { label: "Configure" }, explore: { label: "Explore in detail" } });
    expect(within(c).queryByRole("link")).toBeNull();
    expect(within(c).getByRole("button", { name: "Configure" })).toBeDisabled();
    expect(within(c).getByRole("button", { name: "Explore in detail" })).toBeDisabled();
  });

  it("renders the Technical data slot only when the app provides one", async () => {
    expect(within(card()).queryByRole("button", { name: /Technical data/ })).toBeNull();
    const onOpen = vi.fn();
    const c = card({
      technicalDataSlot: (
        <button type="button" onClick={onOpen}>
          Technical data
        </button>
      ),
    });
    await userEvent.click(within(c).getByRole("button", { name: /Technical data/ }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("mirrors the car in RTL and counter-mirrors the placeholder so its text stays readable", () => {
    expect(card().querySelector("[data-car-area]")).toHaveClass("rtl:-scale-x-100");
    expect(card({ image: null }).querySelector("[data-placeholder]")).toHaveClass(
      "rtl:-scale-x-100",
    );
  });

  it("drops an empty stats or details list rather than rendering an empty panel row", () => {
    const c = card({ stats: [], details: [] });
    expect(within(c).queryAllByRole("term")).toHaveLength(0);
  });

  it("omits the price label for a price on request", () => {
    const c = card({ price: { label: "", value: "Price on request" } });
    expect(within(c).getByText("Price on request").parentElement!.children).toHaveLength(1);
  });

  it("wraps a long title instead of cutting it, and never letter-spaces Arabic", () => {
    const h3 = within(card()).getByRole("heading", { level: 3 });
    expect(h3).toHaveClass("line-clamp-2", "tracking-tight", "rtl:tracking-normal");
    expect(h3).not.toHaveClass("truncate");
  });

  it("shows the from-price and the compare slot", () => {
    const c = card({ compareSlot: <label>Compare</label> });
    expect(within(c).getByText("EGP 3,900,000")).toBeInTheDocument();
    expect(within(c).getByText("Compare")).toBeInTheDocument();
  });

  it("uses tokens for its surface and publishes the contextual pair", () => {
    const article = card().querySelector("article")!;
    // Mist: the surface every brand accent is validated against (brand_themes CHECKs).
    expect(article.style.background).toBe("var(--av-surface)");
    expect(article.style.getPropertyValue("--av-fg")).toBe("var(--av-on-surface)");
  });

  it("has no axe violations, LTR/English and RTL/Arabic, with and without an image", async () => {
    const ltr = render(
      <div dir="ltr" lang="en">
        <VehicleCard {...base} technicalDataSlot={<button type="button">Technical data</button>} />
      </div>,
    ).container;
    expect(await axe(ltr)).toHaveNoViolations();

    const rtl = render(
      <div dir="rtl" lang="ar">
        <VehicleCard
          {...base}
          title="أورورا جي تي"
          image={null}
          imagePlaceholderLabel="الصورة قريبًا"
          highlightsLabel="أبرز المواصفات"
          configure={{ label: "كوّن سيارتك" }}
          explore={{ label: "استكشف التفاصيل" }}
          price={{ label: "تبدأ من", value: "٣٬٩٠٠٬٠٠٠ ج.م." }}
        />
      </div>,
    ).container;
    expect(await axe(rtl)).toHaveNoViolations();
  });
});
