"use client";

import React, { useEffect } from "react";
import { CloseIcon, DownloadIcon } from "@/components/icons";

export function ImageLightbox({
  src,
  filename,
  onClose,
}: {
  src: string;
  filename?: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.92)" }}
      onClick={onClose}
    >
      <div className="absolute top-0 left-0 right-0 flex items-center justify-end gap-2 p-4 z-10">
        <a
          href={src}
          download={filename || true}
          onClick={(e) => e.stopPropagation()}
          className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10"
          style={{ color: "#fff" }}
        >
          <DownloadIcon size={20} />
        </a>
        <button
          type="button"
          onClick={onClose}
          className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10"
          style={{ color: "#fff" }}
        >
          <CloseIcon size={20} />
        </button>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={filename || "Image"}
        className="max-w-[92vw] max-h-[88vh] object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
