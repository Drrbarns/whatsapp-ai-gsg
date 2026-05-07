"use client";

import React from "react";
import { Avatar } from "@/components/Avatar";
import { MoreIcon, PhoneIcon, SearchIcon, VideoCallIcon } from "@/components/icons";
import type { Conversation } from "@/lib/types";

export function ChatHeader({
  conversation,
  onToggleMode,
}: {
  conversation: Conversation;
  onToggleMode: () => void;
}) {
  return (
    <header
      className="flex items-center justify-between h-[60px] px-4"
      style={{ background: "var(--wa-header)", borderBottom: "1px solid var(--wa-divider)" }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <Avatar name={conversation.name} phone={conversation.phone} size={40} />
        <div className="min-w-0">
          <div
            className="text-[15px] font-medium leading-tight truncate"
            style={{ color: "var(--wa-text)" }}
          >
            {conversation.name || conversation.phone}
          </div>
          <div className="text-[12px] leading-tight mt-0.5 flex items-center gap-1.5"
            style={{ color: conversation.is_typing ? "var(--wa-green)" : "var(--wa-text-secondary)" }}
          >
            {conversation.is_typing ? (
              <span className="inline-flex items-center gap-1">
                <TypingDots />
                <span className="italic">AI is typing…</span>
              </span>
            ) : (
              <>
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: conversation.mode === "agent" ? "var(--wa-green)" : "#f59e0b",
                  }}
                />
                <span>{conversation.phone}</span>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1" style={{ color: "var(--wa-text-secondary)" }}>
        <button
          type="button"
          onClick={onToggleMode}
          className="px-3 h-9 rounded-full text-xs font-medium transition-colors mr-2"
          style={{
            background:
              conversation.mode === "agent"
                ? "rgba(0, 168, 132, 0.18)"
                : "rgba(245, 158, 11, 0.18)",
            color: conversation.mode === "agent" ? "var(--wa-green)" : "#f59e0b",
          }}
          title="Toggle who replies"
        >
          {conversation.mode === "agent" ? "AI Mode" : "Human Mode"}
        </button>
        <IconBtn title="Video call"><VideoCallIcon size={20} /></IconBtn>
        <IconBtn title="Voice call"><PhoneIcon size={20} /></IconBtn>
        <IconBtn title="Search"><SearchIcon size={20} /></IconBtn>
        <IconBtn title="More"><MoreIcon size={20} /></IconBtn>
      </div>
    </header>
  );
}

function IconBtn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/[0.06]"
    >
      {children}
    </button>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-end gap-0.5 h-3" aria-label="typing">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="block w-1 h-1 rounded-full"
          style={{
            background: "var(--wa-green)",
            animation: `wa-typing 1.2s infinite ease-in-out`,
            animationDelay: `${i * 0.18}s`,
          }}
        />
      ))}
    </span>
  );
}
