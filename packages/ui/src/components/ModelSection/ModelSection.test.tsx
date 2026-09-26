import { render, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { describe, expect, it } from "vitest";
import { ModelSection } from "./ModelSection";

const section = (cards = 2) =>
  render(
    <ModelSection
      id="aurora-gt"
      name="Aurora GT"
      descriptor="SUV · Electric · AWD"
      price="From EGP 3,900,000"
    >
      {Array.from({ length: cards }, (_, i) => (
        <article key={i} aria-label={`Trim ${i + 1}`}>
          Trim {i + 1}
        </article>
      ))}
    </ModelSection>,
  ).container;

describe("ModelSection", () => {
  it("is a section anchored at the model slug and named by its heading", () => {
    const c = section();
    const s = c.querySelector("section#aurora-gt")!;
    expect(s).toHaveAttribute("aria-labelledby", "aurora-gt-heading");
    const heading = within(c).getByRole("heading", { level: 2 });
    expect(heading).toHaveTextContent("Aurora GT");
    expect(heading).toHaveTextContent("SUV · Electric · AWD");
    expect(heading).toHaveTextContent("From EGP 3,900,000");
  });

  it("puts each card in its own grid cell, however many there are", () => {
    expect(within(section(1)).getAllByRole("listitem")).toHaveLength(1);
    expect(within(section(3)).getAllByRole("listitem")).toHaveLength(3);
  });

  it("opens by default and toggles with its heading button (aria-expanded follows)", async () => {
    const c = section();
    const toggle = within(c).getByRole("button", { name: /Aurora GT/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(within(c).getByText("Trim 1")).toBeVisible();
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(within(c).queryByText("Trim 1")).toBeNull();
    await userEvent.click(toggle);
    expect(within(c).getByText("Trim 1")).toBeVisible();
  });

  it("works from the keyboard: Enter and Space both toggle", async () => {
    const c = section();
    const toggle = within(c).getByRole("button", { name: /Aurora GT/ });
    toggle.focus();
    await userEvent.keyboard("{Enter}");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.keyboard(" ");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("points the toggle at the content it controls (aria-controls)", () => {
    const c = section();
    const toggle = within(c).getByRole("button", { name: /Aurora GT/ });
    const controls = toggle.getAttribute("aria-controls");
    expect(controls).toBeTruthy();
    expect(c.querySelector(`#${CSS.escape(controls!)}`)).toContainElement(
      within(c).getByText("Trim 1"),
    );
  });

  it("uses the motion tokens, and never letter-spaces Arabic", () => {
    const c = section();
    const chevron = c.querySelector("svg")!;
    expect(chevron).toHaveClass("duration-(--av-dur)", "motion-reduce:transition-none");
    expect(within(c).getByText("Aurora GT")).toHaveClass("rtl:tracking-normal");
  });

  it("has no axe violations, in both directions", async () => {
    expect(await axe(section())).toHaveNoViolations();
    const rtl = render(
      <div dir="rtl" lang="ar">
        <ModelSection
          id="aurora"
          name="أورورا"
          descriptor="SUV · كهربائي"
          price="تبدأ من ٣٬٩٠٠٬٠٠٠"
        >
          <article aria-label="فئة">فئة</article>
        </ModelSection>
      </div>,
    ).container;
    expect(await axe(rtl)).toHaveNoViolations();
  });
});
