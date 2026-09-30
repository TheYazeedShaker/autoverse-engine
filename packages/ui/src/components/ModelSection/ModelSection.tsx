"use client";

import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronDown } from "lucide-react";
import { Children, type ReactNode } from "react";
import { cn } from "../../cn";
import { Icon } from "../Icon";
import { Reveal } from "../Reveal";

// ModelSection — one model's block in the range (spec §5.6): a header band (name, descriptor, from-price)
// and its trim cards in the range grid (at most 3 per row). It is rendered for every model, even one with a single trim.
//
// The header toggles the section open and closed, as in the approved page. It follows the APG accordion
// pattern: a heading wrapping a Radix Collapsible trigger (a real <button> with aria-expanded and
// aria-controls), so the model name stays in the heading outline and the toggle is keyboard-operable.
//
// The grid never stretches a card. The column count comes from the card's minimum width, not breakpoints
// (`av-card-grid`, packages/ui/src/styles/tailwind.css; tokens `vehicleCard`), at most 3. A section with
// one or two cards keeps them at one column's width, start-aligned in the reading direction, and no card
// grows past the approved card's max width.

export interface ModelSectionProps {
  /** The model name, shown as the section heading. */
  name: string;
  /** e.g. "SUV · Electric · AWD", already localised. */
  descriptor?: string;
  /** e.g. "From EGP 3,900,000", already localised. */
  price?: string;
  /** Anchor id (the model slug): the dock and deep links scroll here. */
  id: string;
  /** The trim cards. */
  children: ReactNode;
  defaultOpen?: boolean;
  /** A control beside the header, outside the toggle (slice 7: "Request a quote"). A button can't
   *  sit inside the header's toggle button, so it is a sibling, at the end of the band. */
  action?: ReactNode;
  /** Heading level in the page outline. Defaults to 2. */
  headingLevel?: 2 | 3;
  className?: string;
}

export function ModelSection({
  name,
  descriptor,
  price,
  id,
  children,
  defaultOpen = true,
  headingLevel = 2,
  action,
  className,
}: ModelSectionProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <Collapsible.Root asChild defaultOpen={defaultOpen}>
      <section id={id} aria-labelledby={`${id}-heading`} className={cn("scroll-mt-24", className)}>
        {/* Slice 8: the header band fades in as it scrolls into view (reveal level 0, as approved). */}
        <Reveal level={0} className={cn(action && "border-fg/10 flex items-end gap-x-4 border-b")}>
          <Heading id={`${id}-heading`} className={cn("m-0", action && "min-w-0 flex-1")}>
            <Collapsible.Trigger
              className={cn(
                "group focus-visible:ring-focus-ring flex w-full flex-wrap items-end justify-between gap-x-4 gap-y-2 pb-3.5 text-start focus-visible:outline-none focus-visible:ring-2",
                !action && "border-fg/10 border-b",
              )}
            >
              <span className="flex max-w-full min-w-0 shrink-0 flex-col">
                <span className="text-fg text-3xl font-light tracking-tight lg:text-4xl rtl:tracking-normal">
                  {name}
                </span>
                {descriptor ? (
                  <span className="text-fg-muted mt-1.5 text-sm font-normal">{descriptor}</span>
                ) : null}
              </span>
              <span className="flex shrink-0 items-center gap-3.5 pb-0.5">
                {price ? (
                  <span className="text-fg text-sm font-medium whitespace-nowrap">{price}</span>
                ) : null}
                <span className="border-fg/20 text-fg-muted grid size-8 place-items-center rounded-full border">
                  <Icon
                    icon={ChevronDown}
                    size="sm"
                    className="transition-transform duration-(--av-dur-move) ease-(--av-ease-move) group-data-[state=open]:rotate-180 motion-reduce:transition-none"
                  />
                </span>
              </span>
            </Collapsible.Trigger>
          </Heading>
          {action ? <div className="shrink-0 pb-3.5">{action}</div> : null}
        </Reveal>
        <Collapsible.Content className="pt-5 lg:pt-7">
          <ul
            role="list"
            className="av-card-grid items-stretch 2xl:[--card-gap:calc(var(--spacing)*10)]"
          >
            {Children.map(children, (child) => (
              <li className="flex max-w-(--av-card-max-width) min-w-0">
                {/* Slice 8: each card fades in one stagger step after its header (as approved). */}
                <Reveal level={1} className="flex w-full min-w-0">
                  {child}
                </Reveal>
              </li>
            ))}
          </ul>
        </Collapsible.Content>
      </section>
    </Collapsible.Root>
  );
}
