import { cn } from "../../cn";
import { FilterPanel, type FilterPanelProps } from "./FilterPanel";

// FilterSidebar — the desktop frame for the FilterPanel (spec §5.5): a sticky, glassy panel beside the
// model sections. It scrolls on its own when taller than the viewport. The app shows it from `lg` up
// and the FilterSheet below that.

export interface FilterSidebarProps extends Omit<FilterPanelProps, "variant"> {
  /** Accessible name of the landmark, e.g. "Filters". Defaults to the panel title. */
  "aria-label"?: string;
}

export function FilterSidebar({
  className,
  "aria-label": ariaLabel,
  ...panel
}: FilterSidebarProps) {
  return (
    <aside
      aria-label={ariaLabel ?? panel.labels.title}
      className={cn(
        "bg-surface-white/50 border-surface-white/70 sticky top-5 max-h-[calc(100dvh-2.5rem)] w-68 shrink-0 self-start overflow-y-auto rounded-xl border p-5 shadow-lg backdrop-blur-xl backdrop-saturate-150",
        className,
      )}
    >
      <FilterPanel {...panel} variant="sidebar" />
    </aside>
  );
}
