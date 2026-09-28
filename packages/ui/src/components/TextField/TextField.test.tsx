import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TextField } from "./TextField";

afterEach(cleanup);

describe("TextField", () => {
  it("is a labelled input with its hint as the description", () => {
    render(<TextField label="Phone" hint="e.g. 010 1234 5678" required />);
    const input = screen.getByRole("textbox", { name: /Phone/ });
    expect(input).toBeRequired();
    expect(input).toHaveAccessibleDescription("e.g. 010 1234 5678");
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("marks an error invalid and adds it to the description", () => {
    render(<TextField label="Phone" hint="e.g. 010 1234 5678" error="Enter a mobile number" />);
    const input = screen.getByRole("textbox", { name: "Phone" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("e.g. 010 1234 5678 Enter a mobile number");
  });

  it("types like a native input", async () => {
    const onChange = vi.fn();
    render(<TextField label="Full name" onChange={(e) => onChange(e.target.value)} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Full name" }), "Mona");
    expect(onChange).toHaveBeenLastCalledWith("Mona");
  });

  it("has no axe violations, LTR and RTL, with and without an error", async () => {
    const { container } = render(<TextField label="Full name" error="Enter your name" />);
    expect(await axe(container)).toHaveNoViolations();
    cleanup();
    const rtl = render(
      <div dir="rtl" lang="ar">
        <TextField label="الاسم الكامل" hint="كما في الهوية" />
      </div>,
    );
    expect(await axe(rtl.container)).toHaveNoViolations();
  });
});
