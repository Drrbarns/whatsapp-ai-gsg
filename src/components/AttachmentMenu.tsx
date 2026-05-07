"use client";

import React, { useEffect, useRef } from "react";
import { CameraIcon, FileIcon, PhotoIcon, StickerIcon, VideoIcon } from "@/components/icons";

export type AttachmentChoice = "photo" | "document" | "camera" | "video" | "sticker";

export function AttachmentMenu({
  onPick,
  onClose,
}: {
  onPick: (choice: AttachmentChoice) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [onClose]);

  const items: Array<{
    id: AttachmentChoice;
    label: string;
    icon: React.ReactNode;
    color: string;
  }> = [
    { id: "document", label: "Document", icon: <FileIcon size={18} />, color: "#7f66ff" },
    { id: "photo", label: "Photos & videos", icon: <PhotoIcon size={18} />, color: "#0099ff" },
    { id: "camera", label: "Camera", icon: <CameraIcon size={18} />, color: "#e91e63" },
    { id: "video", label: "Video file", icon: <VideoIcon size={18} />, color: "#ff7043" },
    { id: "sticker", label: "Sticker", icon: <StickerIcon size={18} />, color: "#00bfa5" },
  ];

  return (
    <div
      ref={ref}
      className="absolute bottom-14 left-0 w-56 rounded-lg shadow-xl z-30 py-2"
      style={{ background: "var(--wa-header)", border: "1px solid var(--wa-divider)" }}
    >
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          onClick={() => {
            onPick(it.id);
            onClose();
          }}
          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.05] text-left"
        >
          <span
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: it.color, color: "#fff" }}
          >
            {it.icon}
          </span>
          <span className="text-sm" style={{ color: "var(--wa-text)" }}>
            {it.label}
          </span>
        </button>
      ))}
    </div>
  );
}
