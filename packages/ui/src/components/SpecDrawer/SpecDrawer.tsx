"use client";

import * as Collapsible from "@radix-ui/react-collapsible";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import { ChevronDown, X } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { Button } from "../Button";
import { CarImageFrame } from "../CarImageFrame";
import { Icon } from "../Icon";

// SpecDrawer — one trim's technical data (spec §5.8), rebuilt from the approved drawer:
//
// - A side panel from the inline end (the right in LTR, the left in RTL); a full-height sheet on
//   phones.
// - Radix Dialog: the focus trap, Escape and scrim close, scroll lock and focus return are Radix's.
// - Tabs (Radix Tabs, with arrow keys between them) hold collapsible groups (Radix Collapsible, the
//   first of each tab open). A group holds key/value rows and its note.
// - Configure at the bottom: the brand accent (the theming REV's primary), disabled until the
//   configurator exists.
//
// Data-free: the app resolves the ledger for the trim (resolveLedgerRow) and passes strings. The car
// is the app's image element, drawn in the side-view frame (the same box as the cards; ADR 0022).
// Enter and exit motion are deferred to slice 8; it opens and closes instantly.

export interface SpecDrawerRow {
  k: string;
  v: string;
}

export interface SpecDrawerGroup {
  label: string;
  note: string | null;
  rows: SpecDrawerRow[];
}

export interface SpecDrawerTab {
  key: string;
  label: string;
  groups: SpecDrawerGroup[];
}

export interface SpecDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The dialog's title, e.g. "Model details". */
  title: string;
  /** e.g. "2026 · Demo Motors". */
  eyebrow: string;
  modelName: string;
  trimName: string;
  price: string;
  /** The side-view image element, or null for the placeholder. */
  image: ReactNode | null;
  imagePlaceholderLabel: string;
  tabs: SpecDrawerTab[];
  /** Shown when there are no tabs (no ledger yet). */
  pending: string;
  labels: { close: string; configure: string };
  /** The configurator's link when it exists; the button is disabled until then. */
  configureHref?: string;
  /**
   * Where focus returns on close: the control that opened the drawer. Needed where a click does not
   * focus the button (Safari). Without it, whatever had focus when the drawer opened.
   */
  returnFocusTo?: HTMLElement | null;
  /** Reading direction: the panel side, and which arrow key moves to the next tab. The drawer is
   *  portaled to <body>, outside the page's dir, so it sets its own. */
  dir: "ltr" | "rtl";
}

export function SpecDrawer({
  open,
  onOpenChange,
  title,
  eyebrow,
  modelName,
  trimName,
  price,
  image,
  imagePlaceholderLabel,
  tabs,
  pending,
  labels,
  configureHref,
  returnFocusTo,
  dir,
}: SpecDrawerProps) {
  // The drawer is opened by the app (a card's "Technical data"), not by a Dialog.Trigger, so Radix
  // has no trigger to return focus to. Remember what had focus at the moment it opens (read during
  // the render that opens it, before Radix moves focus inside), and return focus there on close.
  const returnTo = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current && typeof document !== "undefined") {
    const focused = document.activeElement;
    returnTo.current = focused instanceof HTMLElement && focused !== document.body ? focused : null;
  }
  wasOpen.current = open;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="bg-surface-dark/45 fixed inset-0 z-40 backdrop-blur-xs" />
        <Dialog.Content
          aria-describedby={undefined}
          dir={dir}
          onCloseAutoFocus={(e) => {
            const target = returnFocusTo ?? returnTo.current;
            if (target?.isConnected) {
              e.preventDefault();
              target.focus();
            }
          }}
          className="bg-surface text-on-surface fixed inset-y-0 end-0 z-40 flex w-full flex-col shadow-lg focus:outline-none md:w-[min(max(30rem,40vw),94vw)] [--av-bg:var(--av-surface)] [--av-fg-muted:var(--av-on-surface-muted)] [--av-fg:var(--av-on-surface)]"
        >
          <div className="flex shrink-0 items-start justify-between gap-3 px-6 pt-4.5">
            <Dialog.Title className="text-fg-muted pt-2 text-xs tracking-[0.2em] uppercase rtl:tracking-normal">
              {title}
            </Dialog.Title>
            <Dialog.Close
              aria-label={labels.close}
              className="border-fg/20 text-fg hover:bg-fg/5 focus-visible:ring-focus-ring grid size-9 shrink-0 place-items-center rounded-full border focus-visible:outline-none focus-visible:ring-2"
            >
              <Icon icon={X} size="sm" />
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-2.5 pb-8">
            <p className="text-fg-muted mt-2 text-xs tracking-[0.18em] uppercase rtl:tracking-normal">
              {eyebrow}
            </p>
            <h3 className="text-fg mt-2 text-3xl font-light tracking-tight md:text-4xl rtl:tracking-normal">
              {modelName}
            </h3>
            <div className="mt-2.5 flex flex-wrap items-baseline justify-between gap-3">
              <span className="text-fg-muted text-xs tracking-[0.14em] uppercase rtl:tracking-normal">
                {trimName}
              </span>
              <span className="text-fg text-base font-medium">{price}</span>
            </div>
            <div className="mt-4 mb-5">
              <CarImageFrame view="side" image={image} placeholderLabel={imagePlaceholderLabel} />
            </div>

            {tabs.length === 0 ? (
              <p className="text-fg-muted border-fg/10 border-t pt-4 text-sm">{pending}</p>
            ) : tabs.length === 1 ? (
              <TabBody tab={tabs[0]!} />
            ) : (
              <Tabs.Root defaultValue={tabs[0]!.key} dir={dir}>
                <Tabs.List className="border-fg/10 flex gap-6 border-b">
                  {tabs.map((tab) => (
                    <Tabs.Trigger
                      key={tab.key}
                      value={tab.key}
                      className="text-fg-muted data-[state=active]:text-fg data-[state=active]:border-accent focus-visible:ring-focus-ring -mb-px border-b-2 border-transparent px-0.5 py-3 text-sm tracking-[0.08em] uppercase transition-colors duration-(--av-dur-fast) ease-(--av-ease) focus-visible:outline-none focus-visible:ring-2 data-[state=active]:font-semibold motion-reduce:transition-none rtl:tracking-normal"
                    >
                      {tab.label}
                    </Tabs.Trigger>
                  ))}
                </Tabs.List>
                {tabs.map((tab) => (
                  <Tabs.Content key={tab.key} value={tab.key} className="focus:outline-none">
                    <TabBody tab={tab} />
                  </Tabs.Content>
                ))}
              </Tabs.Root>
            )}
          </div>

          <div className="border-fg/10 bg-surface shrink-0 border-t px-6 pt-3.5 pb-[calc(0.875rem+env(safe-area-inset-bottom))]">
            {configureHref ? (
              <Button asChild variant="accent" size="lg" className="w-full">
                <a href={configureHref}>{labels.configure}</a>
              </Button>
            ) : (
              <Button variant="accent" size="lg" className="w-full" disabled>
                {labels.configure}
              </Button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function TabBody({ tab }: { tab: SpecDrawerTab }) {
  return (
    <div data-spec-tab={tab.key}>
      {tab.groups.map((group, i) => (
        <Collapsible.Root
          key={`${tab.key}-${i}`}
          defaultOpen={i === 0}
          className="border-fg/10 border-t first:border-t-0"
        >
          <h4 className="m-0">
            <Collapsible.Trigger className="group text-fg focus-visible:ring-focus-ring flex w-full items-center justify-between gap-3 px-0.5 py-4 text-start focus-visible:outline-none focus-visible:ring-2">
              <span className="text-xs font-semibold tracking-[0.14em] uppercase rtl:tracking-normal">
                {group.label}
              </span>
              <span className="border-fg/15 text-fg-muted grid size-6.5 shrink-0 place-items-center rounded-full border">
                <Icon
                  icon={ChevronDown}
                  size="sm"
                  className="transition-transform duration-(--av-dur) ease-(--av-ease) group-data-[state=open]:rotate-180 motion-reduce:transition-none"
                />
              </span>
            </Collapsible.Trigger>
          </h4>
          <Collapsible.Content className="flex flex-col gap-2.5 px-0.5 pb-4.5">
            {group.rows.length > 0 ? (
              <dl className="flex flex-col gap-2.5">
                {group.rows.map((row, r) => (
                  <div key={r} className="flex items-baseline justify-between gap-3.5 text-sm">
                    <dt className="text-fg-muted">{row.k}</dt>
                    <dd className="text-fg text-end font-medium">{row.v}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {group.note ? (
              <p className="text-fg-muted text-xs leading-relaxed">{group.note}</p>
            ) : null}
          </Collapsible.Content>
        </Collapsible.Root>
      ))}
    </div>
  );
}
