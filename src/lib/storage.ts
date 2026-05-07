// =====================================================================
// Supabase Storage helpers — used to persist media (images, audio,
// documents) so we can render them in the dashboard without hitting
// Meta's short-lived URLs.
// =====================================================================

import { adminDb } from "@/lib/supabase";

const BUCKET = "media";

export async function uploadToStorage(opts: {
  buffer: Buffer | Uint8Array;
  mime: string;
  path: string; // e.g. "conversations/<convoId>/<uuid>.webm"
}): Promise<string> {
  const { buffer, mime, path } = opts;
  const db = adminDb();

  const { error } = await db.storage
    .from(BUCKET)
    .upload(path, buffer as Uint8Array, {
      contentType: mime,
      upsert: true,
    });
  if (error) throw new Error(`storage upload failed: ${error.message}`);

  const { data } = db.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export function inferMediaType(
  mime: string
): "image" | "video" | "audio" | "document" | "voice" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

export function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/aac": "aac",
    "audio/ogg": "ogg",
    "audio/webm": "webm",
    "audio/wav": "wav",
    "application/pdf": "pdf",
  };
  return map[mime] || mime.split("/")[1]?.split(";")[0] || "bin";
}
