import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Button } from "../Button";
import { INTRO_STORAGE_KEY, IntroCurtain } from "./IntroCurtain";

// The showroom's once-per-session opening (spec §5.1): a dark curtain with the brand's mark that
// lifts after the first hero image decodes (capped at ~900 ms), or at the first input. Not rendered
// under reduced motion. "Replay" clears this session's flag and mounts it again.

const meta = {
  title: "Showroom/IntroCurtain",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj;

function Demo() {
  const [run, setRun] = useState(0);
  return (
    <div className="bg-surface-panel text-on-panel min-h-[32rem] p-6">
      <p className="mb-4 text-sm">The page under the curtain.</p>
      <Button
        onClick={() => {
          try {
            sessionStorage.removeItem(INTRO_STORAGE_KEY);
          } catch {
            // storage refused in this frame: nothing to clear
          }
          document.documentElement.removeAttribute("data-intro-seen");
          setRun((n) => n + 1);
        }}
      >
        Replay
      </Button>
      <IntroCurtain key={run} logo={null} brandName="Demo Motors" />
    </div>
  );
}

export const Default: Story = { render: () => <Demo /> };
