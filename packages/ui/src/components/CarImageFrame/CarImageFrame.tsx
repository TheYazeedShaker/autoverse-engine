import { Car } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../cn";
import { Icon } from "../Icon";
import { CarEntrance } from "../Reveal";

// CarImageFrame — the one place a car image is drawn (ADR 0022, the asset standard).
//
// Every master is normalised to the same width per view and trimmed tight to the car, and every one
// faces RIGHT. The frame gives each view ONE fixed aspect ratio: the same box on every card and in the
// drawer, and the image fills its width, bottom-aligned (the app's image uses object-contain +
// object-bottom). So every car appears the same size and stands on the same ground line, and a missing
// image (the placeholder) takes exactly the same box, so the layout never jumps.
//
// Direction: the ONLY mirroring anywhere is this frame's RTL mirror, so in Arabic the car faces the
// reading direction. There is no per-model or per-asset flip, and a test (car-direction.test.ts) fails
// if one is ever added.

export type CarView = "side" | "front-34";

/** Width : height of the box per view. Side: the card's car area. Front three-quarter: the hero. */
const ASPECT: Record<CarView, string> = {
  side: "aspect-[2/1]",
  "front-34": "aspect-video",
};

/**
 * The image layer per view: the car fills its view's token share of the box's width (side
 * --av-car-fill-side, hero --av-car-fill-hero; 80% each), centred (absolute + inset-x-0 + mx-auto) and
 * bottom-aligned, so every car in a view has the same width and the same ground line.
 */
const IMAGE_LAYER: Record<CarView, string> = {
  side: "inset-y-0 inset-x-0 mx-auto w-(--av-car-fill-side)",
  "front-34": "inset-y-0 inset-x-0 mx-auto w-(--av-car-fill-hero)",
};

export interface CarImageFrameProps {
  view: CarView;
  /** The app's image element (fill, object-contain, object-bottom), or null for the placeholder. */
  image: ReactNode | null;
  /** Accessible name of the placeholder, e.g. "Image coming soon". */
  placeholderLabel: string;
  /** Where the placeholder draws its fill inside the box, e.g. inset to a card's content width. */
  placeholderClassName?: string;
  /** The car drives in as the frame scrolls into view (slice 8: the cards). */
  entrance?: boolean;
  className?: string;
}

export function CarImageFrame({
  view,
  image,
  placeholderLabel,
  placeholderClassName,
  entrance = false,
  className,
}: CarImageFrameProps) {
  return (
    <div
      data-car-frame={view}
      className={cn("relative w-full shrink-0 rtl:-scale-x-100", ASPECT[view], className)}
    >
      {image && entrance ? (
        <CarEntrance className={cn("absolute drop-shadow-xl", IMAGE_LAYER[view])}>
          {image}
        </CarEntrance>
      ) : image ? (
        <div data-car-image className={cn("absolute drop-shadow-xl", IMAGE_LAYER[view])}>
          {image}
        </div>
      ) : (
        <div
          role="img"
          aria-label={placeholderLabel}
          data-placeholder
          // Counter-mirrored so its icon and text read correctly inside the RTL-mirrored frame.
          className={cn(
            "bg-fg/5 text-fg-muted absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl rtl:-scale-x-100",
            placeholderClassName,
          )}
        >
          <Icon icon={Car} size="lg" />
          <span className="text-xs">{placeholderLabel}</span>
        </div>
      )}
    </div>
  );
}
