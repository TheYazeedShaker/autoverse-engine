import {
  ArrowRight,
  BatteryCharging,
  Car,
  Cog,
  Fuel,
  Gauge,
  Route,
  Timer,
  Users,
  Waypoints,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useId, type CSSProperties, type ReactNode } from "react";
import { cn } from "../../cn";
import { Button } from "../Button";
import { Icon } from "../Icon";

// VehicleCard — one trim, as the approved showroom card (`vehicle-card.dc.html`, spec §5.7), rebuilt in the
// system: tokens only, Lucide glyphs, container-query sizing so the card reads the same at any column width.
//
// It is presentational, framework-free and a SERVER component: it has no state, so a page of cards ships no
// JavaScript for them. Everything shown arrives as props already localised and formatted by the app, so the
// card holds no copy and no brand. Interactive parts are SLOTS the app fills with its own client components
// (the image, Technical data in slice 5, Compare in slice 6), so no function has to cross the server/client
// boundary.
//
// Colour routing (theming REV): the Configure button is the brand accent; the year and the icons are
// "small accents" (--av-accent). The accent is only ever drawn on Mist here: a brand's accent is validated
// for AA against Mist and white only (brand_themes CHECKs), so any other surface could fail for some brand.
//
// The surface itself is an open owner decision (#build-decisions, slice 2: white per the approved file, or a
// greige with a wedge per spec §5.7). SURFACE below is the one place that changes when it is answered.

const SURFACE = {
  bg: "var(--av-surface)",
  fg: "var(--av-on-surface)",
  fgMuted: "var(--av-on-surface-muted)",
};

export type VehicleAttributeIcon = "fuel" | "drive" | "transmission";
export type VehicleStatIcon = "accel" | "power" | "top-speed";
export type VehicleDetailIcon = "pump" | "battery" | "range" | "seats";

const ATTRIBUTE_ICON: Record<VehicleAttributeIcon, LucideIcon> = {
  fuel: Fuel,
  drive: Waypoints,
  transmission: Cog,
};
const STAT_ICON: Record<VehicleStatIcon, LucideIcon> = {
  accel: Timer,
  power: Zap,
  "top-speed": Gauge,
};
const DETAIL_ICON: Record<VehicleDetailIcon, LucideIcon> = {
  pump: Fuel,
  battery: BatteryCharging,
  range: Route,
  seats: Users,
};

export interface VehicleCardProps {
  /** e.g. "2026". Shown as a small accent. */
  year?: string | null;
  /** e.g. "V8", "EV". */
  badge?: string | null;
  /** The card title: the model and trim, e.g. "Lyriq Signature Luxury". Wraps to two lines at most. */
  title: string;
  /** Fuel, drive and transmission, in that order; missing ones are simply left out. */
  attributes: { icon: VehicleAttributeIcon; label: string }[];
  /** The car, side view: the app's image element. Null renders the placeholder. */
  image: ReactNode | null;
  /** Shown in the placeholder, e.g. "Image coming soon". */
  imagePlaceholderLabel: string;
  /** Accessible name of the spec panel, e.g. "Technical highlights". */
  highlightsLabel: string;
  /** Up to three headline figures: value, unit and label already formatted. */
  stats: { icon: VehicleStatIcon; value: string; unit?: string; label: string }[];
  /** Efficiency and seating rows. */
  details: { icon: VehicleDetailIcon; label: string; value: string }[];
  /** The "Technical data ›" row: a client trigger that opens the spec drawer (slice 5). */
  technicalDataSlot?: ReactNode;
  configure: { label: string; href?: string };
  explore: { label: string; href?: string };
  /** The compare control, rendered bottom-left (slice 6). */
  compareSlot?: ReactNode;
  /** `label` is e.g. "From"; empty for "Price on request". */
  price: { label: string; value: string };
  /** Anchor for deep links and the compare tray. */
  id?: string;
  className?: string;
}

/** A link-styled button when there is a destination; otherwise an honest disabled button. */
function Action({
  href,
  label,
  variant,
  trailing,
}: {
  href?: string;
  label: string;
  variant: "accent" | "secondary";
  trailing?: LucideIcon;
}) {
  const classes = "h-12 w-full rounded-lg text-base font-normal";
  const icon = trailing ? <Icon icon={trailing} size="sm" className="rtl:-scale-x-100" /> : null;
  if (href) {
    return (
      <Button asChild variant={variant} className={classes}>
        <a href={href}>
          {label}
          {icon}
        </a>
      </Button>
    );
  }
  return (
    <Button variant={variant} className={classes} disabled>
      {label}
      {icon}
    </Button>
  );
}

export function VehicleCard({
  year,
  badge,
  title,
  attributes,
  image,
  imagePlaceholderLabel,
  highlightsLabel,
  stats,
  details,
  technicalDataSlot,
  configure,
  explore,
  compareSlot,
  price,
  id,
  className,
}: VehicleCardProps) {
  const titleId = useId();
  const style = {
    background: SURFACE.bg,
    color: SURFACE.fg,
    "--av-fg": SURFACE.fg,
    "--av-fg-muted": SURFACE.fgMuted,
    "--av-bg": SURFACE.bg,
  } as CSSProperties;

  return (
    <article
      id={id}
      aria-labelledby={titleId}
      style={style}
      className={cn(
        "@container flex h-full w-full min-w-0 flex-col rounded-2xl border border-fg/10 p-6 @md:p-8",
        className,
      )}
    >
      {/* year · badge */}
      <header className="flex items-center justify-between gap-4 leading-none">
        <span className="text-accent text-sm @md:text-base">{year}</span>
        {badge ? (
          <span className="text-fg text-lg font-bold tracking-tight italic @md:text-xl rtl:tracking-normal">
            {badge}
          </span>
        ) : null}
      </header>

      {/* Wraps (two lines at most) rather than truncating, so a long trim name never loses content. */}
      <h3
        id={titleId}
        className="text-fg mt-4 mb-3 line-clamp-2 text-3xl leading-tight font-light tracking-tight break-words @md:text-4xl rtl:tracking-normal"
      >
        {title}
      </h3>

      {attributes.length > 0 ? (
        <ul className="flex min-w-0 flex-wrap items-center gap-y-1 text-xs @md:text-sm">
          {attributes.map((a, i) => (
            <li
              key={a.icon}
              className={cn(
                "text-fg flex min-w-0 items-center gap-1.5 px-2 whitespace-nowrap first:ps-0 last:pe-0 @md:px-3",
                i < attributes.length - 1 && "border-accent/25 border-e",
              )}
            >
              <Icon icon={ATTRIBUTE_ICON[a.icon]} size="sm" className="text-accent shrink-0" />
              <span className="truncate">{a.label}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* the car, bleeding past the card's inner edges, mirrored in RTL so it faces the reading direction */}
      <div
        data-car-area
        className="my-3 flex h-44 min-w-0 items-end justify-center @sm:h-48 @md:h-64 rtl:-scale-x-100"
      >
        {image ? (
          <div className="relative h-full w-[116%] max-w-[116%] shrink-0 drop-shadow-xl">
            {image}
          </div>
        ) : (
          <div
            role="img"
            aria-label={imagePlaceholderLabel}
            data-placeholder
            className="bg-fg/5 text-fg-muted flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl rtl:-scale-x-100"
          >
            <Icon icon={Car} size="lg" />
            <span className="text-xs">{imagePlaceholderLabel}</span>
          </div>
        )}
      </div>

      {/* the inset spec panel: same surface as the card, set apart by its border */}
      <section
        aria-label={highlightsLabel}
        className="border-fg/10 w-full min-w-0 overflow-hidden rounded-xl border"
      >
        {stats.length > 0 ? (
          <dl className="grid grid-cols-3 px-1.5 py-3 @md:py-4">
            {stats.slice(0, 3).map((s, i) => (
              <div
                key={s.icon}
                className={cn(
                  "flex min-w-0 flex-col items-center px-1 text-center @md:px-2",
                  i < 2 && "border-fg/10 border-e",
                )}
              >
                {/* label first in the DOM (a definition list's order); shown under the figure */}
                <dt className="text-fg-muted order-2 mt-1 w-full truncate text-xs">{s.label}</dt>
                <dd className="text-fg order-1 flex flex-col items-center text-lg font-medium tracking-tight whitespace-nowrap @md:text-xl rtl:tracking-normal">
                  <Icon icon={STAT_ICON[s.icon]} size="md" className="text-accent mb-1.5" />
                  <span>
                    {s.value}
                    {s.unit ? <span className="ms-1 text-base">{s.unit}</span> : null}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        {details.length > 0 ? (
          <dl
            className={cn(
              "flex flex-col gap-3 px-4 py-3 @md:px-5 @md:py-4",
              stats.length > 0 && "border-fg/10 border-t",
            )}
          >
            {details.map((d) => (
              <div key={d.icon} className="flex min-w-0 flex-col gap-1">
                <dt className="text-fg-muted flex items-center gap-2 text-xs @md:text-sm">
                  <Icon icon={DETAIL_ICON[d.icon]} size="sm" className="text-accent shrink-0" />
                  <span>{d.label}</span>
                </dt>
                <dd className="text-fg ps-6 text-sm font-medium whitespace-nowrap @md:text-base">
                  {d.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        {technicalDataSlot ? (
          <div className="border-fg/10 border-t">{technicalDataSlot}</div>
        ) : null}
      </section>

      <div className="mt-4 grid grid-cols-1 gap-3">
        <Action href={configure.href} label={configure.label} variant="accent" />
        <Action
          href={explore.href}
          label={explore.label}
          variant="secondary"
          trailing={ArrowRight}
        />
      </div>

      <footer className="mt-3 flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">{compareSlot}</div>
        <p className="min-w-0 whitespace-nowrap">
          {price.label ? <span className="text-fg-muted me-1.5 text-xs">{price.label}</span> : null}
          <span className="text-fg text-lg font-medium tracking-tight rtl:tracking-normal">
            {price.value}
          </span>
        </p>
      </footer>
    </article>
  );
}
