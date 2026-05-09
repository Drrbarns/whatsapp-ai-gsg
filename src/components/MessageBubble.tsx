"use client";

import React from "react";
import {
  AlertIcon,
  ClockIcon,
  DoubleTickIcon,
  DownloadIcon,
  FileIcon,
  TickIcon,
} from "@/components/icons";
import { AudioPlayer } from "@/components/AudioPlayer";
import { formatBytes, formatTime, renderRichText } from "@/lib/format";
import type { Message } from "@/lib/types";

export function MessageBubble({
  message,
  authorPhone,
  authorName,
  onOpenImage,
}: {
  message: Message;
  authorPhone: string;
  authorName: string | null;
  onOpenImage: (url: string, name: string | null) => void;
}) {
  const outgoing = message.role === "assistant";
  const align = outgoing ? "items-end" : "items-start";
  const justify = outgoing ? "justify-end" : "justify-start";
  const bubbleBg = outgoing ? "var(--wa-bubble-out)" : "var(--wa-bubble-in)";
  const tailClass = outgoing ? "wa-tail-out rounded-tr-none" : "wa-tail-in rounded-tl-none";

  const hasMedia = !!message.media_url && !!message.media_type;
  const isImage = hasMedia && message.media_type === "image";
  const isAudio =
    hasMedia && (message.media_type === "voice" || message.media_type === "audio");
  const isVideo = hasMedia && message.media_type === "video";
  const isDoc = hasMedia && message.media_type === "document";
  const isSticker = hasMedia && message.media_type === "sticker";

  // Pure-text message: shape varies (no padding around image, etc.)
  const onlyText = !hasMedia && !!message.content;
  const onlyMedia = hasMedia && !message.content;

  // Stickers render naked (no bubble bg)
  if (isSticker) {
    return (
      <div className={`flex ${justify} px-2`}>
        <div className={`flex flex-col ${align} max-w-[40%]`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={message.media_url!}
            alt="sticker"
            className="block"
            style={{ maxWidth: 160, maxHeight: 160 }}
          />
          <span
            className="text-[10px] mt-1 px-1 flex items-center gap-1"
            style={{ color: "var(--wa-text-tertiary)" }}
          >
            {formatTime(message.created_at)}
            {outgoing && <StatusIcon status={message.status} />}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${justify} px-2`}>
      <div className={`flex flex-col ${align} max-w-[85%] sm:max-w-[75%] md:max-w-[65%] min-w-0`}>
        <div
          className={`relative wa-bubble shadow-sm ${tailClass}`}
          style={{
            background: bubbleBg,
            color: "var(--wa-text)",
            borderRadius: 8,
            padding: isImage && onlyMedia ? 4 : isImage ? 4 : 6,
            paddingLeft: isAudio || isImage ? undefined : 9,
            paddingRight: isAudio || isImage ? undefined : 9,
            minWidth: isAudio ? 220 : 60,
            maxWidth: "100%",
          }}
        >
          {/* IMAGE */}
          {isImage && (
            <button
              type="button"
              onClick={() => onOpenImage(message.media_url!, message.media_filename)}
              className="block rounded overflow-hidden cursor-zoom-in"
              style={{ maxWidth: 320 }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={message.media_url!}
                alt={message.media_filename || "Image"}
                className="block w-full h-auto rounded"
                style={{ maxHeight: 360, objectFit: "cover" }}
              />
            </button>
          )}

          {/* VIDEO */}
          {isVideo && (
            <video
              src={message.media_url!}
              controls
              className="rounded block"
              style={{ maxWidth: 320, maxHeight: 360 }}
            />
          )}

          {/* AUDIO / VOICE */}
          {isAudio && (
            <div className="px-2 py-1.5">
              <AudioPlayer
                src={message.media_url!}
                durationSecs={message.media_duration_secs}
                isVoice={message.media_type === "voice"}
                outgoing={outgoing}
                authorPhone={authorPhone}
                authorName={authorName}
              />
            </div>
          )}

          {/* DOCUMENT */}
          {isDoc && (
            <a
              href={message.media_url!}
              target="_blank"
              rel="noreferrer"
              download={message.media_filename || true}
              className="flex items-center gap-3 rounded-md px-3 py-2.5 w-full md:min-w-[260px] hover:opacity-90"
              style={{ background: "rgba(0,0,0,0.18)" }}
            >
              <span
                className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(255,255,255,0.06)", color: "var(--wa-text)" }}
              >
                <FileIcon size={22} />
              </span>
              <span className="flex-1 min-w-0">
                <span
                  className="block truncate text-[13px] font-medium"
                  style={{ color: "var(--wa-text)" }}
                >
                  {message.media_filename || "Document"}
                </span>
                <span
                  className="block text-[11px] mt-0.5"
                  style={{ color: "var(--wa-text-secondary)" }}
                >
                  {formatBytes(message.media_size_bytes)} ·{" "}
                  {(message.media_mime || "file").split("/")[1]?.toUpperCase() || "FILE"}
                </span>
              </span>
              <DownloadIcon size={18} style={{ color: "var(--wa-text-secondary)" }} />
            </a>
          )}

          {/* TEXT (caption or standalone) */}
          {message.content && (
            <p
              className={`whitespace-pre-wrap break-words text-[14.2px] leading-[19px] ${
                hasMedia ? "px-2 pt-1.5" : ""
              }`}
              style={{ color: "var(--wa-text)" }}
            >
              {renderRichText(message.content)}
            </p>
          )}

          {/* Time + ticks footer (inline, bottom-right) */}
          <div
            className={`flex items-center gap-1 justify-end pr-1 ${
              onlyText ? "-mt-1 ml-2 float-right pl-2 pt-0.5" : "px-2 pb-0.5 pt-0.5"
            }`}
            style={{ color: "rgba(233, 237, 239, 0.6)", fontSize: 11 }}
          >
            <span style={{ color: "rgba(233, 237, 239, 0.6)" }}>
              {formatTime(message.created_at)}
            </span>
            {outgoing && <StatusIcon status={message.status} />}
          </div>
          {/* Clear float */}
          {onlyText && <div className="clear-both" />}
        </div>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: Message["status"] }) {
  if (status === "queued") {
    return <ClockIcon size={14} style={{ color: "rgba(233,237,239,0.6)" }} />;
  }
  if (status === "failed") {
    return <AlertIcon size={14} style={{ color: "#ef4444" }} />;
  }
  if (status === "sent") {
    return <TickIcon size={16} style={{ color: "rgba(233,237,239,0.6)" }} />;
  }
  if (status === "read") {
    return <DoubleTickIcon size={16} style={{ color: "var(--wa-blue-tick)" }} />;
  }
  // delivered (default)
  return <DoubleTickIcon size={16} style={{ color: "rgba(233,237,239,0.6)" }} />;
}
