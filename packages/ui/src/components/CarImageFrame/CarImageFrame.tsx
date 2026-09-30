import { Car } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../cn";
import { Icon } from "../Icon";
import { CarEntrance } from "../Reveal";

// CarImageFrame — the one place a car image is drawn (ADR 0022, the asset standard).
//
// Every master is normalised to the same width per view and trimmed tight to the car, and every one
// faces RIGHT. The frame gives each view ONE fixed aspect ratio: the same box on every card and in the
// drawer. Side: the box has the masters' own shape (token --av-car-aspect-side, 2.8 : 1) and the car fills
// its token share of the width, centred both ways (the app's image uses object-contain + object-center), so
// there is no band of empty space above it. Every side master has the same width and nearly the same
// shape, so the ground lines stay level to within a few pixels (ADR 0022). Hero: 16:9, bottom-aligned
// (object-bottom). A missing image (the placeholder) takes exactly the same box, so the layout never jumps.
//
// Direction: the ONLY mirroring anywhere is this frame's RTL mirror, so in Arabic the car faces the
// reading direction. There is no per-model or per-asset flip, and a test (car-direction.test.ts) fails
// if one is ever added.

export type CarView = "side" | "front-34";

/** Width : height of the box per view. Side: the card's and drawer's car area (token). Front three-quarter: the hero. */
const ASPECT: Record<CarView, string> = {
  side: "aspect-(--av-car-aspect-side)",
  "front-34": "aspect-video",
};

/**
 * The image layer per view: the car fills its view's token share of the box's width (side
 * --av-car-fill-side, hero --av-car-fill-hero; 80% each), centred (absolute + inset-x-0 + mx-auto), full
 * height; the image's object-position then centres (side) or bottom-aligns (hero) the car.
 */
const IMAGE_LAYER: Record<CarView, string> = {
  side: "inset-y-0 inset-x-0 mx-auto w-(--av-car-fill-side)",
  "front-34": "inset-y-0 inset-x-0 mx-auto w-(--av-car-fill-hero)",
};

export interface CarImageFrameProps {
  view: CarView;
  /** The app's image element (fill, object-contain; object-center for side, object-bottom for the hero), or null. */
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
