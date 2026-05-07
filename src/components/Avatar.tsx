"use client";

import React from "react";
import { avatarHue, getInitials } from "@/lib/format";

export function Avatar({
  name,
  phone,
  size = 40,
  className = "",
}: {
  name: string | null;
  phone: string;
  size?: number;
  className?: string;
}) {
  const hue = avatarHue(phone || name || "wa");
  const initials = getInitials(name, phone);
  return (
    <div
      className={`rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0 select-none ${className}`}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, hsl(${hue}, 45%, 38%), hsl(${(hue + 25) % 360}, 50%, 28%))`,
        fontSize: size * 0.36,
      }}
    >
      {initials}
    </div>
  );
}
