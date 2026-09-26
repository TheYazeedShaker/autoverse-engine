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

// Display
export { StatBlock } from "./components/StatBlock";
export type { StatBlockProps, StatBlockSize } from "./components/StatBlock";

// Surface
export { Card } from "./components/Card";
export type { CardProps, CardTone, CardPadding } from "./components/Card";

// Showroom (PAGE-CONSUMER-SHOWROOM)
export { VehicleCard } from "./components/VehicleCard";
export type {
  VehicleCardProps,
  VehicleAttributeIcon,
  VehicleStatIcon,
  VehicleDetailIcon,
} from "./components/VehicleCard";
export { ModelSection } from "./components/ModelSection";
export type { ModelSectionProps } from "./components/ModelSection";

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
