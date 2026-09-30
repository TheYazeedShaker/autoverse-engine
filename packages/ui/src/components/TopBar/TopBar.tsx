import type { ReactNode } from "react";
import { cn } from "../../cn";
import { Button } from "../Button";

// TopBar — the showroom's header (spec §5.2), rebuilt from the approved page: the brand (logo slot or
// wordmark), the market chip ("EG · EGP"), the EN/AR switch, and "Book a test drive".
//
// - A server component: the language switch is two plain links (the page is rendered per language),
//   marked with hreflang and aria-current, so it works without JavaScript.
// - On the Onyx surface (owner, slice 8: the same colour as the intro curtain, which lifts into it; the
//   hero below stays Gunmetal): it re-publishes the contextual pair, so the inverting primary button
//   (Mist with Onyx text, as approved) is AA.
// - Its height is the `--av-topbar-height` token; the hero fills the screen below it.
// - "Book a test drive" opens the LeadModal (slice 7). The bar stays a server component: the app
//   passes its client button as `bookTestDriveSlot`. Without a slot, the button is honestly disabled.
//   Either way it is hidden on phones, as in the approved page.

export interface TopBarLanguage {
  /** BCP 47 code, e.g. "en", "ar". */
  code: string;
  /** Shown in its own language, e.g. "EN", "عربي". */
  label: string;
  href: string;
  current: boolean;
}

export interface TopBarProps {
  /** The brand's logo element (a theme slot), or null to show the wordmark. */
  logo?: ReactNode | null;
  /** The brand name: the wordmark when there is no logo. */
  brandName: string;
  /** e.g. "EG · EGP". */
  marketLabel: string;
  languages: TopBarLanguage[];
  /** The language switch's accessible name, e.g. "Language". */
  languageLabel: string;
  bookTestDrive: { label: string; onClick?: () => void; disabled?: boolean };
  /** The app's client button for "Book a test drive" (it opens the LeadModal). Replaces the default. */
  bookTestDriveSlot?: ReactNode;
  className?: string;
}

export function TopBar({
  logo,
  brandName,
  marketLabel,
  languages,
  languageLabel,
  bookTestDrive,
  bookTestDriveSlot,
  className,
}: TopBarProps) {
  return (
    <header
      className={cn(
        "bg-surface-onyx text-on-onyx border-on-onyx/10 flex h-(--av-topbar-height) items-center justify-between gap-4 border-b px-4 sm:px-[4.5vw] [--av-bg:var(--av-surface-onyx)] [--av-fg-muted:var(--av-on-onyx-muted)] [--av-fg:var(--av-on-onyx)]",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3.5">
        <span className="text-on-onyx flex min-w-0 items-center truncate text-lg font-semibold tracking-tight rtl:tracking-normal">
          {logo ?? brandName}
        </span>
        <span className="text-on-onyx-muted border-on-onyx/20 hidden rounded-full border px-3 py-1 text-xs tracking-[0.16em] whitespace-nowrap uppercase sm:inline-block rtl:tracking-normal">
          {marketLabel}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <nav aria-label={languageLabel}>
          <ul
            role="list"
            className="border-on-onyx/15 bg-surface-onyx flex rounded-full border p-0.5"
          >
            {languages.map((l) => (
              <li key={l.code}>
                <a
                  href={l.href}
                  hrefLang={l.code}
                  lang={l.code}
                  aria-current={l.current ? "true" : undefined}
                  className={cn(
                    // The ring is the contextual ink (Mist): the focus-ring token is Onyx, invisible on this bar.
                    "focus-visible:ring-fg block rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors duration-(--av-dur-modal) ease-(--av-ease-modal) focus-visible:outline-none focus-visible:ring-2 motion-reduce:transition-none",
                    l.current
                      ? "bg-surface text-on-surface"
                      : "text-on-onyx-soft hover:text-on-onyx",
                  )}
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        {bookTestDriveSlot ? (
          <div className="hidden md:block">{bookTestDriveSlot}</div>
        ) : (
          <Button
            variant="primary"
            size="sm"
            className="hidden md:inline-flex"
            disabled={bookTestDrive.disabled ?? !bookTestDrive.onClick}
            onClick={bookTestDrive.onClick}
          >
            {bookTestDrive.label}
          </Button>
        )}
      </div>
    </header>
  );
}
