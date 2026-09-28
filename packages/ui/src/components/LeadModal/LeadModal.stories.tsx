import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../Button";
import { LEAD_COPY_AR, LEAD_COPY_EN, useLeadFixture } from "./fixtures";
import { LeadModal } from "./LeadModal";

// The showroom's lead form (spec §6, §5.10). The approved export has no form, so it is built from the
// system's form primitives in the drawer's visual language. Data-free: the app owns the values,
// validation, the capture contract and the outcome; these stories show each state it renders.

const meta = {
  title: "Showroom/LeadModal",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj;

function Demo({
  copy = LEAD_COPY_EN,
  overrides,
}: {
  copy?: typeof LEAD_COPY_EN;
  overrides?: Parameters<typeof useLeadFixture>[1];
}) {
  const { props, setOpen } = useLeadFixture(copy, overrides);
  return (
    <div className="bg-surface-panel min-h-[48rem] p-6">
      <Button onClick={() => setOpen(true)}>{copy.eyebrow}</Button>
      <LeadModal {...props} />
    </div>
  );
}

export const Default: Story = { render: () => <Demo /> };

/** A submit with missing or invalid fields. */
export const WithErrors: Story = {
  render: () => (
    <Demo
      overrides={{
        errors: {
          fullName: "Enter your name",
          phone: "Enter an Egyptian mobile number, e.g. 010 1234 5678",
          city: "Choose your city",
          consent: "Please agree to be contacted",
        },
      }}
    />
  ),
};

/** Sending, with retries in progress (503 or network: same submission id, fresh verification). */
export const Submitting: Story = {
  render: () => <Demo overrides={{ status: "submitting", progress: "Still trying…" }} />,
};

/** A failure after the retries: a readable message, and the form kept. */
export const Failed: Story = {
  render: () => (
    <Demo
      overrides={{
        alert: {
          tone: "error",
          message: "We couldn't send your request. Please try again in a moment.",
        },
      }}
    />
  ),
};

export const Success: Story = { render: () => <Demo overrides={{ status: "success" }} /> };

export const SuccessWithoutWhatsApp: Story = {
  render: () => <Demo overrides={{ status: "success", whatsapp: false }} />,
};

export const Arabic: Story = {
  globals: { direction: "rtl" },
  render: () => <Demo copy={LEAD_COPY_AR} />,
};

export const ArabicSuccess: Story = {
  globals: { direction: "rtl" },
  render: () => <Demo copy={LEAD_COPY_AR} overrides={{ status: "success" }} />,
};
