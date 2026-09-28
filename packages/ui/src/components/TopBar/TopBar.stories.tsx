import type { Meta, StoryObj } from "@storybook/react-vite";
import { TopBar } from "./TopBar";

// The showroom header (spec §5.2): brand wordmark (or logo slot), market chip, EN/AR switch (plain
// links), and "Book a test drive" (disabled until the lead modal, slice 7; hidden on phones).

const meta = {
  title: "Showroom/TopBar",
  component: TopBar,
  parameters: { layout: "fullscreen" },
  args: {
    brandName: "Demo Motors",
    marketLabel: "EG · EGP",
    languageLabel: "Language",
    languages: [
      { code: "en", label: "EN", href: "?lang=en", current: true },
      { code: "ar", label: "عربي", href: "?lang=ar", current: false },
    ],
    bookTestDrive: { label: "Book a test drive" },
  },
} satisfies Meta<typeof TopBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Arabic: Story = {
  globals: { direction: "rtl" },
  args: {
    brandName: "ديمو موتورز",
    marketLabel: "EG · EGP",
    languageLabel: "اللغة",
    languages: [
      { code: "en", label: "EN", href: "?lang=en", current: false },
      { code: "ar", label: "عربي", href: "?lang=ar", current: true },
    ],
    bookTestDrive: { label: "احجز تجربة قيادة" },
  },
};
