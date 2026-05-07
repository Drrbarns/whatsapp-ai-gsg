// =====================================================================
// Meta WhatsApp Cloud API helpers — text + media (image/audio/voice/
// video/document). All calls hit graph.facebook.com/v22.0.
// =====================================================================

const GRAPH = "https://graph.facebook.com/v22.0";

function phoneNumberId() {
  const id = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!id) throw new Error("WHATSAPP_PHONE_NUMBER_ID is not set");
  return id;
}

function token() {
  const t = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!t) throw new Error("WHATSAPP_ACCESS_TOKEN is not set");
  return t;
}

function authHeaders() {
  return { Authorization: `Bearer ${token()}` };
}

// Shape of a successful Cloud API send response.
export type WhatsAppSendResponse = {
  messages?: Array<{ id?: string; message_status?: string }>;
  contacts?: Array<{ wa_id?: string; input?: string }>;
  error?: WhatsAppApiError;
};

export type WhatsAppApiError = {
  message: string;
  code: number;
  type?: string;
  error_data?: { details?: string };
  fbtrace_id?: string;
};

// ----- Outbound: text -------------------------------------------------
export async function sendWhatsAppMessage(
  to: string,
  body: string
): Promise<WhatsAppSendResponse> {
  const res = await fetch(`${GRAPH}/${phoneNumberId()}/messages`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body, preview_url: true },
    }),
  });
  const json = (await res.json()) as WhatsAppSendResponse;
  if (!res.ok || json.error) {
    console.error(
      `WhatsApp send failed (${res.status}) to ${to}:`,
      JSON.stringify(json.error || json)
    );
  }
  return json;
}

// ----- Outbound: upload file to Meta, get a media_id ------------------
// Meta keeps the media for ~30 days. We then reference the id when sending.
export async function uploadMediaToWhatsApp(
  fileBuffer: Buffer | Uint8Array,
  mime: string,
  filename: string
): Promise<string> {
  const blob = new Blob([fileBuffer as BlobPart], { type: mime });
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mime);
  form.append("file", blob, filename);

  const res = await fetch(`${GRAPH}/${phoneNumberId()}/media`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  const json = (await res.json()) as { id?: string; error?: unknown };
  if (!json.id) {
    throw new Error(`WhatsApp media upload failed: ${JSON.stringify(json)}`);
  }
  return json.id;
}

// ----- Outbound: send a media message ---------------------------------
export type WhatsAppMediaKind = "image" | "audio" | "video" | "document" | "sticker";

export async function sendWhatsAppMedia(opts: {
  to: string;
  kind: WhatsAppMediaKind;
  mediaId: string;
  caption?: string;
  filename?: string;
  isVoice?: boolean; // only meaningful for kind="audio"
}) {
  const { to, kind, mediaId, caption, filename, isVoice } = opts;

  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to,
    type: kind,
  };

  const mediaPayload: Record<string, unknown> = { id: mediaId };
  if (caption && (kind === "image" || kind === "video" || kind === "document")) {
    mediaPayload.caption = caption;
  }
  if (filename && kind === "document") mediaPayload.filename = filename;
  if (isVoice && kind === "audio") mediaPayload.voice = true;
  payload[kind] = mediaPayload;

  const res = await fetch(`${GRAPH}/${phoneNumberId()}/messages`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

// ----- Inbound: download a media file by id ---------------------------
// Meta gives us a media_id in the webhook. We must hit /{id} to get a
// short-lived URL, then GET the URL with our auth token to download.
export async function downloadWhatsAppMedia(
  mediaId: string
): Promise<{ buffer: Buffer; mime: string; filename: string }> {
  const meta = await fetch(`${GRAPH}/${mediaId}`, { headers: authHeaders() });
  const metaJson = (await meta.json()) as {
    url?: string;
    mime_type?: string;
    file_size?: number;
    sha256?: string;
    id?: string;
  };
  if (!metaJson.url) {
    throw new Error(`WhatsApp media metadata missing url: ${JSON.stringify(metaJson)}`);
  }

  const fileRes = await fetch(metaJson.url, { headers: authHeaders() });
  if (!fileRes.ok) {
    throw new Error(`WhatsApp media download failed: ${fileRes.status}`);
  }
  const arrayBuf = await fileRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);

  const mime = metaJson.mime_type || fileRes.headers.get("content-type") || "application/octet-stream";
  const ext = mime.split("/")[1]?.split(";")[0] || "bin";
  const filename = `${mediaId}.${ext}`;

  return { buffer, mime, filename };
}

// ----- Outbound: Interactive Reply Buttons (max 3 buttons, ≤20 chars each)
// ---------------------------------------------------------------------
export type WhatsAppButton = {
  id: string; // postback id (≤256 chars). Returned to webhook on click.
  title: string; // visible label (≤20 chars)
};

export async function sendWhatsAppButtons(opts: {
  to: string;
  body: string;
  buttons: WhatsAppButton[];
  /** Plain text header (≤60 chars) — mutually exclusive with imageHeaderUrl */
  header?: string;
  /** Image URL to use as the message header (rich product card style) */
  imageHeaderUrl?: string;
  footer?: string;
}): Promise<WhatsAppSendResponse> {
  const { to, body, buttons, header, imageHeaderUrl, footer } = opts;
  if (buttons.length === 0 || buttons.length > 3) {
    throw new Error("WhatsApp Reply Buttons require 1–3 buttons");
  }

  const interactive: Record<string, unknown> = {
    type: "button",
    body: { text: body.slice(0, 1024) },
    action: {
      buttons: buttons.map((b) => ({
        type: "reply",
        reply: { id: b.id.slice(0, 256), title: b.title.slice(0, 20) },
      })),
    },
  };
  if (imageHeaderUrl) {
    interactive.header = { type: "image", image: { link: imageHeaderUrl } };
  } else if (header) {
    interactive.header = { type: "text", text: header.slice(0, 60) };
  }
  if (footer) interactive.footer = { text: footer.slice(0, 60) };

  const res = await fetch(`${GRAPH}/${phoneNumberId()}/messages`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive,
    }),
  });
  const json = (await res.json()) as WhatsAppSendResponse;
  if (!res.ok || json.error) {
    console.error(
      `WhatsApp buttons send failed (${res.status}) to ${to}:`,
      JSON.stringify(json.error || json)
    );
  }
  return json;
}

// ----- Outbound: Interactive List (up to 10 rows across 1–10 sections)
// ---------------------------------------------------------------------
export type WhatsAppListRow = {
  id: string; // postback id (≤200 chars)
  title: string; // visible (≤24 chars)
  description?: string; // (≤72 chars)
};
export type WhatsAppListSection = {
  title?: string; // section header (≤24 chars)
  rows: WhatsAppListRow[];
};

export async function sendWhatsAppList(opts: {
  to: string;
  body: string;
  buttonText: string; // label shown for the list-open button (≤20 chars)
  sections: WhatsAppListSection[];
  header?: string;
  footer?: string;
}): Promise<WhatsAppSendResponse> {
  const { to, body, buttonText, sections, header, footer } = opts;
  const flatRows = sections.flatMap((s) => s.rows);
  if (flatRows.length === 0 || flatRows.length > 10) {
    throw new Error("WhatsApp List requires 1–10 total rows");
  }

  const interactive: Record<string, unknown> = {
    type: "list",
    body: { text: body.slice(0, 1024) },
    action: {
      button: buttonText.slice(0, 20),
      sections: sections.map((s) => ({
        ...(s.title ? { title: s.title.slice(0, 24) } : {}),
        rows: s.rows.map((r) => ({
          id: r.id.slice(0, 200),
          title: r.title.slice(0, 24),
          ...(r.description ? { description: r.description.slice(0, 72) } : {}),
        })),
      })),
    },
  };
  if (header) interactive.header = { type: "text", text: header.slice(0, 60) };
  if (footer) interactive.footer = { text: footer.slice(0, 60) };

  const res = await fetch(`${GRAPH}/${phoneNumberId()}/messages`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive,
    }),
  });
  const json = (await res.json()) as WhatsAppSendResponse;
  if (!res.ok || json.error) {
    console.error(
      `WhatsApp list send failed (${res.status}) to ${to}:`,
      JSON.stringify(json.error || json)
    );
  }
  return json;
}

// ----- Outbound: CTA URL Button (single big button that opens a link)
// ---------------------------------------------------------------------
export async function sendWhatsAppCtaUrl(opts: {
  to: string;
  body: string;
  buttonText: string;
  url: string;
  header?: string;
  footer?: string;
}): Promise<WhatsAppSendResponse> {
  const { to, body, buttonText, url, header, footer } = opts;

  const interactive: Record<string, unknown> = {
    type: "cta_url",
    body: { text: body.slice(0, 1024) },
    action: {
      name: "cta_url",
      parameters: { display_text: buttonText.slice(0, 20), url },
    },
  };
  if (header) interactive.header = { type: "text", text: header.slice(0, 60) };
  if (footer) interactive.footer = { text: footer.slice(0, 60) };

  const res = await fetch(`${GRAPH}/${phoneNumberId()}/messages`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive,
    }),
  });
  const json = (await res.json()) as WhatsAppSendResponse;
  if (!res.ok || json.error) {
    console.error(
      `WhatsApp CTA send failed (${res.status}) to ${to}:`,
      JSON.stringify(json.error || json)
    );
  }
  return json;
}

// ----- Outbound: Image by URL (caption optional) — no upload roundtrip
// Meta caches the image after first send, so subsequent sends are fast.
// ---------------------------------------------------------------------
export async function sendWhatsAppImageByUrl(opts: {
  to: string;
  imageUrl: string;
  caption?: string;
}): Promise<WhatsAppSendResponse> {
  const { to, imageUrl, caption } = opts;
  const res = await fetch(`${GRAPH}/${phoneNumberId()}/messages`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "image",
      image: { link: imageUrl, ...(caption ? { caption: caption.slice(0, 1024) } : {}) },
    }),
  });
  const json = (await res.json()) as WhatsAppSendResponse;
  if (!res.ok || json.error) {
    console.error(
      `WhatsApp image-by-url send failed (${res.status}) to ${to}:`,
      JSON.stringify(json.error || json)
    );
  }
  return json;
}

// ----- Mark a message as read (blue ticks for the sender) -------------
// When `typing: true`, Meta also shows the "typing…" dots in the
// customer's WhatsApp chat for up to 25 seconds (or until we send the
// next message). Combine both into one round-trip.
export async function markWhatsAppMessageRead(
  whatsappMsgId: string,
  opts: { typing?: boolean } = {}
) {
  const body: Record<string, unknown> = {
    messaging_product: "whatsapp",
    status: "read",
    message_id: whatsappMsgId,
  };
  if (opts.typing) {
    body.typing_indicator = { type: "text" };
  }
  const res = await fetch(`${GRAPH}/${phoneNumberId()}/messages`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => ({}));
}
