import type { VehicleCardProps } from "@autoverse/ui";
import type { Copy, Lang } from "./copy";
import { formatPrice, type Showroom, type ShowroomModel, type ShowroomTrim } from "./loader";

// Loader view → ModelSection / VehicleCard props (spec §5.6, §5.7). Pure, so every rule is unit
// tested. All copy comes from the i18n layer and all numbers are formatted for the page's language.
// The image element itself is built by the page (next/image).

export type CardProps = Omit<VehicleCardProps, "image">;

export interface SectionProps {
  id: string;
  name: string;
  descriptor: string;
  price: string;
}

/** Numbers in the page's language: Arabic-Indic digits for AR (market locale), Western for EN. */
function numberFormat(lang: Lang, market: Showroom["market"], fractionDigits = 0) {
  return new Intl.NumberFormat(lang === "ar" ? market.locale : `en-${market.code}`, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

export function sectionProps(
  model: ShowroomModel,
  lang: Lang,
  market: Showroom["market"],
  t: Copy,
): SectionProps {
  // "SUV · Electric · AWD": body, fuel and the (first trim's) drive, from the vocabulary.
  const drive = model.trims[0]?.stats.drive ?? null;
  const descriptor = [model.body, model.fuel, drive]
    .filter((v): v is NonNullable<typeof v> => v !== null)
    .map((v) => v.label[lang])
    .join(" · ");
  const price =
    model.fromPrice.kind === "amount"
      ? `${t.from} ${formatPrice(model.fromPrice, lang, market, t.priceOnRequest)}`
      : t.priceOnRequest;
  return { id: model.slug, name: model.name[lang], descriptor, price };
}

export function cardProps(
  model: ShowroomModel,
  trim: ShowroomTrim,
  lang: Lang,
  market: Showroom["market"],
  t: Copy,
): CardProps {
  // A model with one trim shows just its name; with several, each card names its trim.
  const title =
    model.trims.length > 1 ? `${model.name[lang]} ${trim.name[lang]}` : model.name[lang];
  const int = numberFormat(lang, market);
  const oneDecimal = numberFormat(lang, market, 1);

  const attributes: CardProps["attributes"] = [];
  if (model.fuel) attributes.push({ icon: "fuel", label: model.fuel.label[lang] });
  if (trim.stats.drive) attributes.push({ icon: "drive", label: trim.stats.drive.label[lang] });
  if (model.transmission) {
    attributes.push({ icon: "transmission", label: model.transmission.label[lang] });
  }

  const stats: CardProps["stats"] = [];
  const { accelS, powerHp, topSpeedKph, seats } = trim.stats;
  if (accelS !== null) {
    stats.push({
      icon: "accel",
      value: oneDecimal.format(accelS),
      unit: t.unitSeconds,
      label: t.accel,
    });
  }
  if (powerHp !== null) {
    stats.push({ icon: "power", value: int.format(powerHp), unit: t.unitHp, label: t.power });
  }
  if (topSpeedKph !== null) {
    stats.push({
      icon: "top-speed",
      value: int.format(topSpeedKph),
      unit: t.unitKph,
      label: t.topSpeed,
    });
  }

  const details: CardProps["details"] = [];
  if (model.efficiency) {
    details.push({
      icon: model.efficiency.icon,
      label: model.efficiency.label[lang],
      value: model.efficiency.value,
    });
  }
  if (seats !== null) {
    details.push({
      icon: "seats",
      label: t.seatingCapacity,
      value: t.seats(int.format(seats), seats),
    });
  }

  return {
    id: `${model.slug}-${trim.slug}`,
    year: model.year === null ? null : String(model.year),
    badge: model.badge,
    title,
    attributes,
    imagePlaceholderLabel: t.imageComingSoon,
    highlightsLabel: t.highlights,
    stats,
    details,
    // The configurator and trim pages have their own specs and don't exist yet, so these are
    // honestly disabled rather than linking to a 404 (spec §9: later slices / pages).
    configure: { label: t.configure },
    explore: { label: t.explore },
    price:
      trim.price.kind === "amount"
        ? { label: t.from, value: formatPrice(trim.price, lang, market, t.priceOnRequest) }
        : { label: "", value: t.priceOnRequest },
  };
}
