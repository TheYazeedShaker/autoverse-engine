// @autoverse/types — single source of truth for domain + protocol types.
// Never redeclare these locally; import from "@autoverse/types".

/* ============================ Identity & tenancy ============================ */
export type PlatformRole = "superadmin" | "ops" | "content_editor" | "support" | "read_only";
export type BrandRole = "brand_admin" | "brand_analyst" | "brand_viewer";
export type Tier = "free" | "tier1" | "tier2" | "tier3";
export type BillingState = "free" | "pending_activation" | "active" | "past_due" | "cancelled";

export interface Brand {
  id: string;
  slug: string; // e.g. "acme-motors" (fictional) — also the configurator brandId
  name: string;
  status: "draft" | "live" | "paused";
  tier: Tier;
  freePeriodStart: string | null; // ISO
  freePeriodEnd: string | null; // ISO
  billingState: BillingState;
  createdAt: string;
}

export interface Profile {
  id: string; // = auth.users.id
  brandId: string | null; // null for Autoverse staff
  platformRole: PlatformRole | null; // set for Autoverse staff
  brandRole: BrandRole | null; // set for brand staff
  displayName: string | null;
}

/* ============================ Catalog ============================ */
// Option IDs are the SHARED VOCABULARY agreed with Nmesis. Keep these in sync with the manifest.
export type OptionType = "exterior_color" | "interior_color" | "trim" | "wheels" | "lighting";

export type ConfigState = Partial<Record<OptionType, string>> & {
  price?: number;
  currency?: string;
};

export interface ModelManifest {
  options: Partial<Record<OptionType, string[]>>;
  views: string[]; // e.g. ["exterior", "interior"]
  lighting: string[]; // e.g. ["day", "night", "ambient"]
  features: string[]; // e.g. ["pano_roof"]
}

export interface Model {
  id: string; // configurator modelId, e.g. "am-7" (fictional)
  brandId: string;
  name: string;
  status: "draft" | "live";
  lightConfiguratorUrl: string;
  pixelStreamingUrl: string | null;
  manifest: ModelManifest; // source of truth on our side; validated against the configurator's ready signal
}

/* ============================ Configurator protocol ============================
   Mirrors the Nmesis Integration Spec. Autoverse SENDS commands, RECEIVES signals. */

export type ConfiguratorMode = "light" | "pixel";

// Autoverse -> configurator
export type ConfiguratorCommand =
  | { command: "init"; data: { mode: ConfiguratorMode; config?: ConfigState; lang?: "en" | "ar" } }
  | { command: "set_option"; data: { type: OptionType; value: string } }
  | { command: "apply_config"; data: { config: ConfigState } }
  | { command: "set_view"; data: { view: string } }
  | { command: "set_lighting"; data: { mode: string } }
  | { command: "play_feature"; data: { featureId: string } }
  | { command: "preload"; data: { states: ConfigState[] } }
  | { command: "request_snapshot"; data: Record<string, never> }
  | { command: "reset"; data: Record<string, never> };

/** A command on the wire. Intersecting with the union keeps each command paired with its own
 *  `data` shape — `{ command: "set_option", data: { mode: "light" } }` does not typecheck. */
export type CommandEnvelope = { source: "autoverse"; version: string } & ConfiguratorCommand;

// configurator -> Autoverse
export type ConfiguratorSignal =
  | {
      event: "ready";
      data: { manifest: ModelManifest; configuratorVersion: string; assetVersion: string };
    }
  | { event: "state_applied"; data: { command: string; config: ConfigState } }
  | { event: "loading"; data: { busy: boolean } }
  | { event: "error"; data: { command: string; reason: string } }
  | { event: "canvas_interaction"; data: { action: string; detail?: Record<string, unknown> } }
  | {
      event: "session";
      data: { state: "started" | "quality" | "ended"; detail?: Record<string, unknown> };
    }
  | { event: "snapshot"; data: { imageDataUrl: string } };

/** A signal on the wire — same pairing guarantee as CommandEnvelope: `event` narrows `data`. */
export type SignalEnvelope = {
  source: "nmesis-configurator";
  version: string;
  brandId: string;
  modelId: string;
  sessionId: string;
  timestamp: string; // ISO 8601
} & ConfiguratorSignal;

/* ============================ Analytics & leads ============================ */
export type Platform = "web" | "mobile";

export interface AnalyticsEvent {
  id: string;
  brandId: string;
  modelId: string | null;
  platform: Platform;
  sessionId: string;
  consumerId: string | null; // null when anonymous
  name: string; // first-party control event OR a configurator signal name
  props: Record<string, unknown>;
  occurredAt: string;
}

export type LeadType = "quote" | "test_drive";

export interface Lead {
  id: string;
  brandId: string;
  modelId: string;
  type: LeadType;
  contact: {
    salutation?: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    preferredContact?: "phone" | "email" | "whatsapp";
    purchaseTimeframe?: "now" | "1_3_months" | "3_6_months" | "browsing";
  };
  testDrive?: { showroom: string; preferredDate: string };
  config: ConfigState;
  createdAt: string;
}
