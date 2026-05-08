// ============================================================================
// Brand-context renderers.
//
// The brand context has NO database tools. Its only "rich" outputs are:
//   1. The main menu (List Message of all 6 business units)
//   2. Individual CTA buttons that deep-link to a business unit's website
//
// These are sent AFTER the AI's text reply, the same way the goods context
// sends product cards after its text reply.
// ============================================================================

import {
  sendWhatsAppCtaUrl,
  sendWhatsAppList,
} from "@/lib/whatsapp";
import { BUSINESS_UNITS, type BusinessUnit } from "./knowledge";

export type BrandRenderHint =
  | { kind: "menu" }
  | { kind: "cta"; unit: BusinessUnit }
  | { kind: "none" };

async function renderMenu(to: string) {
  const rows = BUSINESS_UNITS.map((u) => ({
    id: `bu:${u.key}`,
    title: u.title.slice(0, 24),
    description: u.hasAgent
      ? "Chat about this here"
      : "Open the website",
  }));

  await sendWhatsAppList({
    to,
    body:
      "Here's what we offer at GSG Brands. Tap one to open it:",
    buttonText: "View services",
    sections: [{ title: "GSG Brands services", rows }],
  }).catch((err) => console.error("[brand-render] menu failed:", err));
}

async function renderCta(to: string, unit: BusinessUnit) {
  await sendWhatsAppCtaUrl({
    to,
    header: unit.title,
    body: unit.description.slice(0, 1024),
    buttonText: "Open",
    url: unit.url,
    footer: "GSG Brands",
  }).catch((err) => console.error("[brand-render] cta failed:", err));
}

export async function renderBrandHint(
  to: string,
  hint: BrandRenderHint
): Promise<void> {
  switch (hint.kind) {
    case "menu":
      return renderMenu(to);
    case "cta":
      return renderCta(to, hint.unit);
    case "none":
    default:
      return;
  }
}

export async function renderBrandHints(
  to: string,
  hints: BrandRenderHint[]
): Promise<void> {
  // Dedupe identical hints
  const seen = new Set<string>();
  for (const h of hints) {
    const key = h.kind === "cta" ? `cta:${h.unit.key}` : h.kind;
    if (seen.has(key)) continue;
    if (h.kind === "none") continue;
    seen.add(key);
    await renderBrandHint(to, h);
  }
}
