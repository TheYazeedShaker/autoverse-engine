import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2, type LucideIcon } from "lucide-react";
import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "../../cn";
import { Icon, type IconSize } from "../Icon";

// Button is the first interactive primitive: Radix Slot for `asChild` composition + token-mapped Tailwind
// utilities for appearance (ADR-0004 / ADR-0007). Variants are monochrome and AA on BOTH surfaces because
// they are built on the contextual fg/bg pair (`--av-fg`/`--av-bg`, set per surface): `primary` fills with
// the surface ink and paints its label in the surface canvas (`bg-fg text-bg`), so it inverts — dark-on-light
// on a light surface, light-on-dark on a dark one, never dark-on-dark. `secondary`/`ghost` tint the ink.
// State is via Tailwind pseudo-variants; a11y (focus ring, disabled) is built in.
export const buttonVariants = cva(
  "inline-flex select-none items-center justify-center whitespace-nowrap rounded-md font-medium transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-fg text-bg hover:bg-fg/90 active:bg-fg/80",
        secondary: "border border-fg/30 text-fg hover:bg-fg/10 active:bg-fg/15",
        ghost: "text-fg hover:bg-fg/10 active:bg-fg/15",
        // The brand accent (theming REV: primary buttons). Its label colour is the validated on-accent
        // pair, and its focus ring is the brand focus colour, so it stays AA for any brand.
        accent:
          "bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-hover focus-visible:ring-focus-ring",
      },
      size: {
        sm: "h-8 gap-1.5 px-3 text-sm",
        md: "h-10 gap-2 px-4 text-base",
        lg: "h-12 gap-2.5 px-6 text-lg",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

// Icon sizes tuned to button height (16 for sm/md, 20 for lg). Icons inherit currentColor → always AA.
const ICON_SIZE: Record<NonNullable<ButtonProps["size"]>, IconSize> = {
  sm: "sm",
  md: "sm",
  lg: "md",
};

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Render as the single child element (e.g. an `<a>`) via Radix Slot, keeping the button styling. */
  asChild?: boolean;
  /** Leading / trailing Lucide glyph (decorative). Ignored when `asChild` (Slot takes one child). */
  leadingIcon?: LucideIcon;
  trailingIcon?: LucideIcon;
  /** Shows a spinner, disables interaction and sets `aria-busy`. Ignored when `asChild`. */
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant,
    size,
    asChild,
    leadingIcon,
    trailingIcon,
    loading,
    disabled,
    children,
    ...props
  },
  ref,
) {
  const classes = cn(buttonVariants({ variant, size }), className);

  // Slot clones a single child; injecting icons/spinner would break that contract, so pass content through.
  if (asChild) {
    return (
      <Slot ref={ref} className={classes} {...props}>
        {children}
      </Slot>
    );
  }

  const iconSize = ICON_SIZE[size ?? "md"];
  return (
    <button
      ref={ref}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <Icon icon={Loader2} size={iconSize} className="animate-spin motion-reduce:animate-none" />
      ) : leadingIcon ? (
        <Icon icon={leadingIcon} size={iconSize} />
      ) : null}
      {children}
      {!loading && trailingIcon ? <Icon icon={trailingIcon} size={iconSize} /> : null}
    </button>
  );
});
