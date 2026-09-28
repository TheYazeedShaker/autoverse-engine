import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LEAD_COPY_AR, LEAD_COPY_EN, useLeadFixture } from "./fixtures";
import { LeadModal, type LeadModalProps } from "./LeadModal";

afterEach(cleanup);

type Overrides = Parameters<typeof useLeadFixture>[1];

function Harness({
  copy = LEAD_COPY_EN,
  overrides,
  patch,
}: {
  copy?: typeof LEAD_COPY_EN;
  overrides?: Overrides;
  patch?: Partial<LeadModalProps>;
}) {
  const { props } = useLeadFixture(copy, overrides);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Book a test drive
      </button>
      <LeadModal {...props} {...patch} open={open} onOpenChange={setOpen} />
    </>
  );
}

const openModal = async (args: Parameters<typeof Harness>[0] = {}) => {
  render(<Harness {...args} />);
  await userEvent.click(screen.getByRole("button", { name: "Book a test drive" }));
  return screen.getByRole("dialog");
};

describe("LeadModal", () => {
  it("is a titled modal dialog with every field of spec §6, and focuses the name first", async () => {
    const dialog = await openModal();
    expect(dialog).toHaveAccessibleName("Demo SUV");
    expect(dialog).toHaveAccessibleDescription(/Leave your details/);
    const name = within(dialog).getByRole("textbox", { name: /Full name/ });
    expect(name).toHaveFocus();
    expect(within(dialog).getByRole("textbox", { name: /Mobile number/ })).toHaveAttribute(
      "type",
      "tel",
    );
    expect(within(dialog).getByRole("combobox", { name: /City/ })).toBeInTheDocument();
    expect(within(dialog).getByRole("combobox", { name: /Model of interest/ })).toHaveTextContent(
      "Demo SUV",
    );
    const times = within(dialog).getByRole("radiogroup", { name: /When would you like/ });
    expect(
      within(times)
        .getAllByRole("radio")
        .map((r) => r.textContent),
    ).toEqual(["Today", "This week", "Just exploring"]);
    expect(within(dialog).getByRole("checkbox", { name: /Placeholder consent/ })).toBeRequired();
  });

  it("submits through onSubmit (Enter or the button), never a page navigation", async () => {
    const onSubmit = vi.fn();
    const dialog = await openModal({ patch: { onSubmit } });
    await userEvent.type(within(dialog).getByRole("textbox", { name: /Full name/ }), "Mona{Enter}");
    await userEvent.click(within(dialog).getByRole("button", { name: "Send request" }));
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("while submitting: the fields and the button are disabled and the progress is announced", async () => {
    const onSubmit = vi.fn();
    const dialog = await openModal({
      overrides: { status: "submitting", progress: "Still trying…" },
      patch: { onSubmit },
    });
    expect(within(dialog).getByRole("textbox", { name: /Full name/ })).toBeDisabled();
    const submit = within(dialog).getByRole("button", { name: /Send request/ });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute("aria-busy", "true");
    expect(within(dialog).getByText("Still trying…")).toBeInTheDocument();
  });

  it("an error alert interrupts; field errors are tied to their fields", async () => {
    const dialog = await openModal({
      overrides: {
        alert: { tone: "error", message: "We couldn't send your request." },
        errors: { phone: "Enter an Egyptian mobile number", consent: "Please agree" },
      },
    });
    expect(within(dialog).getByRole("alert")).toHaveTextContent("We couldn't send your request.");
    expect(
      within(dialog).getByRole("textbox", { name: /Mobile number/ }),
    ).toHaveAccessibleDescription(/Enter an Egyptian mobile number/);
    expect(within(dialog).getByRole("checkbox")).toHaveAttribute("aria-invalid", "true");
  });

  it("a failed validation moves focus to the first invalid field", async () => {
    function Validating() {
      const { props } = useLeadFixture(LEAD_COPY_EN, {
        errors: { phone: "Enter an Egyptian mobile number" },
      });
      const [attempt, setAttempt] = useState(0);
      return (
        <LeadModal
          {...props}
          validationAttempt={attempt}
          onSubmit={() => setAttempt((a) => a + 1)}
        />
      );
    }
    render(<Validating />);
    await userEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect(screen.getByRole("textbox", { name: /Mobile number/ })).toHaveFocus();
  });

  it("success: a confirmation with the WhatsApp shortcut; focus moves to its heading", async () => {
    const dialog = await openModal({ overrides: { status: "success" } });
    const heading = within(dialog).getByRole("heading", { name: "Request received" });
    expect(heading).toHaveFocus();
    expect(dialog).toHaveAccessibleName("Request received");
    const wa = within(dialog).getByRole("link", { name: /WhatsApp/ });
    expect(wa).toHaveAttribute("href", "https://wa.me/201000000000");
    expect(wa).toHaveAttribute("rel", "noopener noreferrer");
    expect(within(dialog).queryByRole("textbox")).toBeNull();
  });

  it("success without a WhatsApp number: no shortcut", async () => {
    const dialog = await openModal({ overrides: { status: "success", whatsapp: false } });
    expect(within(dialog).queryByRole("link")).toBeNull();
  });

  it("Escape closes it and returns focus to the opener", async () => {
    await openModal();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Book a test drive" })).toHaveFocus();
  });

  it("returns focus to returnFocusTo when given (an opener a click doesn't focus)", async () => {
    function Explicit() {
      const { props } = useLeadFixture(LEAD_COPY_EN);
      const [open, setOpen] = useState(false);
      const [opener, setOpener] = useState<HTMLElement | null>(null);
      return (
        <>
          <button type="button" ref={setOpener}>
            Opener
          </button>
          <button type="button" onClick={() => setOpen(true)}>
            Other
          </button>
          <LeadModal {...props} open={open} onOpenChange={setOpen} returnFocusTo={opener} />
        </>
      );
    }
    render(<Explicit />);
    await userEvent.click(screen.getByRole("button", { name: "Other" }));
    await act(async () => {
      await userEvent.keyboard("{Escape}");
    });
    expect(screen.getByRole("button", { name: "Opener" })).toHaveFocus();
  });

  it("sets its own direction (it is portaled out of the page)", async () => {
    const dialog = await openModal({ copy: LEAD_COPY_AR });
    expect(dialog).toHaveAttribute("dir", "rtl");
    // The phone number reads left to right in Arabic too.
    expect(within(dialog).getByRole("textbox", { name: /رقم الموبايل/ })).toHaveAttribute(
      "dir",
      "ltr",
    );
  });

  it("has no axe violations: form (LTR, RTL, with errors) and success", async () => {
    await openModal({
      overrides: {
        alert: { tone: "error", message: "We couldn't send your request." },
        errors: { fullName: "Enter your name", city: "Choose your city" },
      },
    });
    expect(await axe(document.body)).toHaveNoViolations();
    cleanup();
    await openModal({ copy: LEAD_COPY_AR });
    expect(await axe(document.body)).toHaveNoViolations();
    cleanup();
    await openModal({ overrides: { status: "success" } });
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
