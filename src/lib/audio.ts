// =====================================================================
// Server-side audio transcoding via ffmpeg-static.
//
// Browsers can only record audio/webm;codecs=opus or audio/mp4 — but
// the WhatsApp Cloud API requires audio/ogg;codecs=opus for voice
// notes. We re-mux/transcode here before forwarding to Meta.
// =====================================================================

import ffmpegPath from "ffmpeg-static";
import { spawn } from "node:child_process";

export type TranscodeResult = {
  buffer: Buffer;
  mime: string;
  filename: string;
  /** Best-effort duration in seconds, parsed from ffmpeg stderr. */
  durationSecs: number | null;
};

/**
 * Transcode an arbitrary audio blob to ogg/opus suitable for WhatsApp
 * voice notes. Reads from stdin, writes to stdout.
 */
export async function transcodeToOggOpus(
  input: Buffer,
  inputMime: string
): Promise<TranscodeResult> {
  const bin = ffmpegPath as unknown as string | null;
  if (!bin) {
    throw new Error("ffmpeg binary not available");
  }

  // Hint the demuxer based on the source mime; ffmpeg can usually probe
  // automatically, but stdin can't be seeked so a hint avoids errors.
  const formatHint = inputMime.includes("webm")
    ? ["-f", "matroska,webm"]
    : inputMime.includes("mp4") || inputMime.includes("m4a")
    ? ["-f", "mp4"]
    : inputMime.includes("ogg")
    ? ["-f", "ogg"]
    : [];

  const args = [
    "-hide_banner",
    "-loglevel", "error",
    "-stats",
    ...formatHint,
    "-i", "pipe:0",
    "-vn",
    "-c:a", "libopus",
    "-b:a", "32k",
    "-ar", "48000",
    "-ac", "1",
    "-application", "voip",
    "-f", "ogg",
    "pipe:1",
  ];

  const proc = spawn(bin, args, { stdio: ["pipe", "pipe", "pipe"] });

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  proc.stdout.on("data", (c) => stdoutChunks.push(c as Buffer));
  proc.stderr.on("data", (c) => stderrChunks.push(c as Buffer));

  // Stream input
  proc.stdin.write(input);
  proc.stdin.end();

  const exitCode: number = await new Promise((resolve, reject) => {
    proc.on("error", reject);
    proc.on("close", (code) => resolve(code ?? -1));
  });

  if (exitCode !== 0) {
    const err = Buffer.concat(stderrChunks).toString("utf8");
    throw new Error(`ffmpeg transcode failed (exit ${exitCode}): ${err}`);
  }

  const buffer = Buffer.concat(stdoutChunks);
  const stderr = Buffer.concat(stderrChunks).toString("utf8");
  const durationSecs = parseDurationFromStderr(stderr);

  return {
    buffer,
    mime: "audio/ogg",
    filename: `voice-${Date.now()}.ogg`,
    durationSecs,
  };
}

function parseDurationFromStderr(stderr: string): number | null {
  // ffmpeg progress prints lines like:
  //   size=N/A time=00:00:03.42 bitrate=N/A speed=...
  const matches = [...stderr.matchAll(/time=(\d+):(\d+):(\d+\.\d+)/g)];
  const last = matches[matches.length - 1];
  if (!last) return null;
  const [, h, m, s] = last;
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}
