// @autoverse/ui — the ONLY place components live. Every surface imports from here.
// The design-system library is built up slice by slice (Phase 1, documented in Storybook).
export { cn } from "./cn";
export { Surface } from "./surface";

// Layout
export { Container } from "./components/Container";
export type { ContainerProps, ContainerWidth } from "./components/Container";
export { Grid, Col } from "./components/Grid";
export type { GridProps, GridGap, ColProps, ColSpan } from "./components/Grid";

// Interactive
export { Button, buttonVariants } from "./components/Button";
export type { ButtonProps } from "./components/Button";
export { Swatch } from "./components/Swatch";
export type { SwatchProps, SwatchSize } from "./components/Swatch";
export { SegmentedToggle } from "./components/SegmentedToggle";
export type {
  SegmentedToggleProps,
  SegmentedToggleSize,
  SegmentedOption,
} from "./components/SegmentedToggle";

// Forms (slice 7, the lead form)
export { TextField } from "./components/TextField";
export type { TextFieldProps } from "./components/TextField";
export { Select } from "./components/Select";
export type { SelectProps, SelectOption } from "./components/Select";
export { Checkbox } from "./components/Checkbox";
export type { CheckboxProps } from "./components/Checkbox";

// Display
export { StatBlock } from "./components/StatBlock";
export type { StatBlockProps, StatBlockSize } from "./components/StatBlock";

// Surface
export { Card } from "./components/Card";
export type { CardProps, CardTone, CardPadding } from "./components/Card";

// Showroom (PAGE-CONSUMER-SHOWROOM)
export { CarImageFrame } from "./components/CarImageFrame";
export type { CarImageFrameProps, CarView } from "./components/CarImageFrame";
export { VehicleCard } from "./components/VehicleCard";
export type {
  VehicleCardProps,
  VehicleAttributeIcon,
  VehicleStatIcon,
  VehicleDetailIcon,
} from "./components/VehicleCard";
export { ModelSection } from "./components/ModelSection";
export type { ModelSectionProps } from "./components/ModelSection";
export { ModelCarousel, CountUp } from "./components/ModelCarousel";
export type {
  ModelCarouselProps,
  HeroModel,
  HeroTrim,
  HeroState,
  CountUpProps,
} from "./components/ModelCarousel";
export { ModelDock } from "./components/ModelDock";
export { TopBar } from "./components/TopBar";
export { CompareTray, CompareToggle } from "./components/CompareTray";
export type {
  CompareTrayProps,
  CompareTrayItem,
  CompareToggleProps,
} from "./components/CompareTray";
export { SpecDrawer, SpecDrawerTrigger } from "./components/SpecDrawer";
export type {
  SpecDrawerProps,
  SpecDrawerTab,
  SpecDrawerGroup,
  SpecDrawerRow,
  SpecDrawerTriggerProps,
} from "./components/SpecDrawer";
export type { TopBarProps, TopBarLanguage } from "./components/TopBar";
export { IntroCurtain, INTRO_CURTAIN_SCRIPT, INTRO_STORAGE_KEY } from "./components/IntroCurtain";
export type { IntroCurtainProps } from "./components/IntroCurtain";
export { Reveal, CarEntrance, StatCount } from "./components/Reveal";
export type { RevealProps, StatCountProps } from "./components/Reveal";
export { LeadModal } from "./components/LeadModal";
export type { LeadModalProps, LeadTextBinding, LeadSelectBinding } from "./components/LeadModal";
export type { ModelDockProps, DockModel } from "./components/ModelDock";
export { semanticMotion } from "./motion";
export { useReducedMotion } from "motion/react";
export { FilterPanel, FilterSidebar, FilterSheet } from "./components/FilterPanel";
export type {
  FilterPanelProps,
  FilterGroup,
  FilterOption,
  SortOption,
  FilterSidebarProps,
  FilterSheetProps,
} from "./components/FilterPanel";

// Primitives
export { Icon } from "./components/Icon";
export type { IconProps, IconSize } from "./components/Icon";
export { Text, Heading } from "./components/Text";
export type {
  TextProps,
  TextSize,
  TextWeight,
  HeadingProps,
  HeadingLevel,
  HeadingSize,
} from "./components/Text";
