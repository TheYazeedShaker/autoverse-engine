import type { CSSProperties, ReactNode } from "react";
import { contrastRatio, meetsAA } from "@autoverse/tokens/contrast";
import {
  breakpoints,
  elevation,
  fonts,
  motion,
  palette,
  radius,
  space,
  status,
  surfaces,
  text,
} from "@autoverse/tokens";

// Display-only building blocks for the Foundations docs pages. They READ the tokens (the single
// source) and render them — including live WCAG ratios computed with the same contrast util the
// §4.2 invariant test uses, so these pages are the visual counterpart to that test.

const mono: CSSProperties = { fontFamily: "var(--av-font-mono)", fontSize: "0.78rem" };
const card: CSSProperties = {
  border: "1px solid var(--av-border)",
  borderRadius: "var(--av-radius)",
  overflow: "hidden",
  background: "var(--av-surface)",
  color: "var(--av-on-surface)",
};

function Grid({ min = 220, children }: { min?: number; children: ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gap: 12,
        gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`,
      }}
    >
      {children}
    </div>
  );
}

/** PASS/FAIL badge for a contrast ratio, using the muted status tokens. */
export function ContrastBadge({
  fg,
  bg,
  large = false,
}: {
  fg: string;
  bg: string;
  large?: boolean;
}) {
  const ratio = contrastRatio(fg, bg);
  const ok = meetsAA(fg, bg, large ? "large" : "normal");
  return (
    <span
      style={{
        ...mono,
        display: "inline-flex",
        gap: 6,
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: "var(--av-radius-pill)",
        background: ok ? "var(--av-surface-success)" : "var(--av-surface-error)",
        color: ok ? "var(--av-on-success)" : "var(--av-on-error)",
      }}
    >
      {ratio.toFixed(2)}:1 {ok ? "AA ✓" : "FAIL ✗"}
    </span>
  );
}

/** Every palette colour as a chip: rendered via its CSS var, labelled with name + hex. */
export function PaletteGrid() {
  return (
    <Grid min={160}>
      {Object.entries(palette).map(([name, hex]) => (
        <div key={name} style={card}>
          <div style={{ height: 64, background: hex }} />
          <div style={{ padding: 10 }}>
            <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>{name}</div>
            <div style={{ ...mono, color: "var(--av-on-surface-muted)" }}>{hex}</div>
          </div>
        </div>
      ))}
    </Grid>
  );
}

/** Each registered surface rendered with its OWN paired foreground + live AA ratios (the §4.2 proof). */
export function SurfaceMatrix() {
  return (
    <Grid min={260}>
      {Object.entries(surfaces).map(([name, s]) => (
        <div key={name} style={{ ...card, background: s.bg, color: s.fg }}>
          <div style={{ padding: 16, display: "grid", gap: 8 }}>
            <div style={{ fontWeight: 700 }}>{name}</div>
            <div style={{ fontSize: "1.5rem", lineHeight: 1.1 }}>
              Aa <span style={{ color: s.fgMute }}>Aa</span>
            </div>
            <div style={{ ...mono, opacity: 0.9 }}>bg {s.bg}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <ContrastBadge fg={s.fg} bg={s.bg} />
              <ContrastBadge fg={s.fgMute} bg={s.bg} />
            </div>
          </div>
        </div>
      ))}
    </Grid>
  );
}

/** Status solids shown on the light canvas (border/icon/strong-text usage). */
export function StatusSolids() {
  return (
    <Grid min={160}>
      {Object.entries(status).map(([name, hex]) => (
        <div key={name} style={card}>
          <div style={{ padding: 14, display: "grid", gap: 8 }}>
            <span style={{ color: hex, fontWeight: 700 }}>{name}</span>
            <div style={{ height: 4, background: hex, borderRadius: 2 }} />
            <ContrastBadge fg={hex} bg={palette.mist} large />
          </div>
        </div>
      ))}
    </Grid>
  );
}

export function TypeScale() {
  const order = ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl"] as const;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {order.map((k) => (
        <div key={k} style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
          <span style={{ ...mono, width: 96, color: "var(--av-on-surface-muted)" }}>
            {k} · {text[k]}
          </span>
          <span style={{ fontSize: text[k] }}>Drive the experience</span>
        </div>
      ))}
    </div>
  );
}

export function FontFamilies() {
  const weights = [300, 400, 500, 700, 800];
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {weights.map((w) => (
        <div key={w} style={{ fontFamily: fonts.en, fontWeight: w, fontSize: "1.4rem" }}>
          Autoverse — Google Sans Flex {w}
        </div>
      ))}
    </div>
  );
}

/** Arabic specimen under lang=ar / dir=rtl — proves the Cairo + RTL switch. */
export function ArabicSpecimen() {
  return (
    <div
      lang="ar"
      dir="rtl"
      style={{ ...card, padding: 20, fontFamily: fonts.ar, display: "grid", gap: 8 }}
    >
      <div style={{ fontSize: "2rem", fontWeight: 700 }}>أوتوفيرس</div>
      <div style={{ fontSize: "1.1rem" }}>اكتشف سيارتك المثالية وصمّمها بالكامل.</div>
      <div style={{ ...mono, color: "var(--av-on-surface-muted)" }}>
        Cairo · lang=&quot;ar&quot; dir=&quot;rtl&quot;
      </div>
    </div>
  );
}

export function SpacingScale() {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {Object.values(space).map((px) => (
        <div key={px} style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ ...mono, width: 56, color: "var(--av-on-surface-muted)" }}>{px}px</span>
          <span
            style={{ height: 12, width: px, background: "var(--av-accent)", borderRadius: 2 }}
          />
        </div>
      ))}
    </div>
  );
}

export function RadiusScale() {
  return (
    <Grid min={120}>
      {Object.entries(radius).map(([name, px]) => (
        <div key={name} style={{ display: "grid", gap: 6, justifyItems: "center" }}>
          <div
            style={{
              width: 72,
              height: 72,
              background: "var(--av-surface-panel)",
              border: "1px solid var(--av-border)",
              borderRadius: name === "pill" ? 999 : px,
            }}
          />
          <span style={{ ...mono, color: "var(--av-on-surface-muted)" }}>
            {name} · {px === 999 ? "999" : `${px}px`}
          </span>
        </div>
      ))}
    </Grid>
  );
}

export function ElevationScale() {
  return (
    <Grid min={160}>
      {Object.entries(elevation).map(([name, shadow]) => (
        <div key={name} style={{ display: "grid", gap: 8, justifyItems: "center", padding: 12 }}>
          <div
            style={{
              width: 96,
              height: 64,
              background: "var(--av-surface)",
              borderRadius: "var(--av-radius)",
              boxShadow: shadow,
            }}
          />
          <span style={{ ...mono, color: "var(--av-on-surface-muted)" }}>{name}</span>
        </div>
      ))}
    </Grid>
  );
}

export function MotionScale() {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {Object.entries(motion).map(([name, val]) => (
        <div key={name} style={{ ...mono }}>
          <span style={{ color: "var(--av-on-surface-muted)" }}>{name}</span> · {String(val)}
          {typeof val === "number" ? "ms" : ""}
        </div>
      ))}
      <div style={{ ...mono, color: "var(--av-on-surface-muted)" }}>
        breakpoints:{" "}
        {Object.entries(breakpoints)
          .map(([k, v]) => `${k} ${v}px`)
          .join(" · ")}
      </div>
    </div>
  );
}
