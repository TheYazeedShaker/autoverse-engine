"use client";

import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronDown } from "lucide-react";
import { Children, type ReactNode } from "react";
import { cn } from "../../cn";
import { Icon } from "../Icon";

// ModelSection — one model's block in the range (spec §5.6): a header band (name, descriptor, from-price)
// and its trim cards in the 3-per-row grid. It is rendered for every model, even one with a single trim.
//
// The header toggles the section open and closed, as in the approved page. It follows the APG accordion
// pattern: a heading wrapping a Radix Collapsible trigger (a real <button> with aria-expanded and
// aria-controls), so the model name stays in the heading outline and the toggle is keyboard-operable.
//
// The grid never stretches a card. A section with one or two cards keeps them at one column's width,
// start-aligned in the reading direction.

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
  className,
}: ModelSectionProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <Collapsible.Root asChild defaultOpen={defaultOpen}>
      <section id={id} aria-labelledby={`${id}-heading`} className={cn("scroll-mt-24", className)}>
        <Heading id={`${id}-heading`} className="m-0">
          <Collapsible.Trigger className="group border-fg/10 focus-visible:ring-focus-ring flex w-full flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b pb-3.5 text-start focus-visible:outline-none focus-visible:ring-2">
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
                  className="transition-transform duration-(--av-dur) ease-(--av-ease) group-data-[state=open]:rotate-180 motion-reduce:transition-none"
                />
              </span>
            </span>
          </Collapsible.Trigger>
        </Heading>
        <Collapsible.Content className="pt-5 lg:pt-7">
          <ul
            role="list"
            className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-2 xl:grid-cols-3 2xl:gap-10"
          >
            {Children.map(children, (child) => (
              <li className="flex min-w-0 max-w-[35rem]">{child}</li>
            ))}
          </ul>
        </Collapsible.Content>
      </section>
    </Collapsible.Root>
  );
}
