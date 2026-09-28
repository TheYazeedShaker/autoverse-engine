import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { CompareToggle } from "./CompareToggle";
import { CompareTray, type CompareTrayItem } from "./CompareTray";

// Compare (spec §5.9): the card's Compare checkbox and the floating tray. Up to the limit (the other
// checkboxes disable and say why); "Compare N" from 2 picks, and only when the compare page exists.

const meta = {
  title: "Showroom/CompareTray",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj;

const TRIMS: CompareTrayItem[] = [
  { id: "a", name: "Aurora GT Long Range", thumbnail: null },
  { id: "b", name: "Vela Base", thumbnail: null },
  { id: "c", name: "Nimbus Base", thumbnail: null },
  { id: "d", name: "Stratos Sport", thumbnail: null },
];

function Demo({
  initial = ["a", "b"],
  href = "/compare",
}: {
  initial?: string[];
  href?: string | null;
}) {
  const [selected, setSelected] = useState(initial);
  return (
    <div className="bg-surface-panel flex min-h-[30rem] flex-col gap-3 p-6">
      {TRIMS.map((t) => (
        <CompareToggle
          key={t.id}
          label={`Compare · ${t.name}`}
          checked={selected.includes(t.id)}
          atLimit={selected.length >= 3}
          limitNote="Up to 3 trims can be compared"
          onCheckedChange={(on) =>
            setSelected((s) => (on ? [...s, t.id] : s.filter((x) => x !== t.id)))
          }
        />
      ))}
      <CompareTray
        items={TRIMS.filter((t) => selected.includes(t.id))}
        onRemove={(id) => setSelected((s) => s.filter((x) => x !== id))}
        href={href}
        labels={{
          region: "Comparison",
          remove: (n) => `Remove ${n}`,
          removeShort: "Remove",
          compare: (n) => `Compare ${n}`,
          status: (n) => `${n} selected for comparison`,
        }}
      />
    </div>
  );
}

export const TwoPicked: Story = { render: () => <Demo /> };
export const AtTheLimit: Story = { render: () => <Demo initial={["a", "b", "c"]} /> };
/** The compare page's flag is off: Compare stays disabled. */
export const CompareUnavailable: Story = { render: () => <Demo href={null} /> };
