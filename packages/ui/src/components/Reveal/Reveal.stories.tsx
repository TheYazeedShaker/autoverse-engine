import type { Meta, StoryObj } from "@storybook/react-vite";
import { CarEntrance } from "./CarEntrance";
import { Reveal } from "./Reveal";
import { StatCount } from "./StatCount";

// Scroll-into-view motion (slice 8, from the approved page). Scroll down: the header fades in, then
// the card a stagger step later; the car drives in from behind and the figure counts up. Anything in
// view at load is simply there, and reduced motion shows everything at once.

const meta = { title: "Showroom/Reveal", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj;

function Page() {
  return (
    <div className="bg-surface-panel text-on-panel px-6">
      <p className="flex h-[120vh] items-center text-sm">Scroll down.</p>
      <Reveal level={0}>
        <h2 className="text-3xl font-light">A section header</h2>
      </Reveal>
      <Reveal level={1} className="mt-6 max-w-md">
        <div className="bg-surface-white text-on-white rounded-2xl p-6">
          <div className="relative aspect-[2/1] w-full">
            <CarEntrance>
              <div
                role="img"
                aria-label="A car, side view"
                className="bg-fg/10 h-full w-full rounded-xl"
              />
            </CarEntrance>
          </div>
          <p className="mt-4 text-xl font-medium">
            <StatCount
              final="420"
              to={420}
              fractionDigits={0}
              locale="en-EG"
              numberingSystem="latn"
            />{" "}
            hp
          </p>
        </div>
      </Reveal>
      <div className="h-[60vh]" />
    </div>
  );
}

export const Default: Story = { render: () => <Page /> };
