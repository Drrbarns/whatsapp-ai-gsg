"use client";

import React, { useEffect, useRef } from "react";
import { MessageBubble } from "@/components/MessageBubble";
import { formatDateSeparator } from "@/lib/format";
import type { Conversation, Message } from "@/lib/types";

export function MessageList({
  messages,
  conversation,
  onOpenImage,
}: {
  messages: Message[];
  conversation: Conversation;
  onOpenImage: (url: string, name: string | null) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, conversation.is_typing]);

  // Group consecutive messages by date
  const items: React.ReactNode[] = [];
  let lastDate = "";
  messages.forEach((m) => {
    const d = new Date(m.created_at).toDateString();
    if (d !== lastDate) {
      items.push(
        <div key={`sep-${m.id}`} className="flex justify-center my-3">
          <span
            className="text-[11px] font-semibold tracking-wider px-3 py-1 rounded-md shadow-sm"
            style={{
              background: "rgba(11, 20, 26, 0.85)",
              color: "var(--wa-text-secondary)",
            }}
          >
            {formatDateSeparator(m.created_at)}
          </span>
        </div>
      );
      lastDate = d;
    }
    items.push(
      <MessageBubble
        key={m.id}
        message={m}
        authorPhone={conversation.phone}
        authorName={conversation.name}
        onOpenImage={onOpenImage}
      />
    );
  });

  return (
    <div className="flex-1 overflow-y-auto wa-doodle">
      {messages.length === 0 ? (
        <div
          className="h-full flex flex-col items-center justify-center"
          style={{ color: "var(--wa-text-tertiary)" }}
        >
          <div
            className="px-4 py-2 rounded-md"
            style={{ background: "rgba(11,20,26,0.7)" }}
          >
            <span className="text-[12px]">No messages yet — say hello 👋</span>
          </div>
        </div>
      ) : (
        <div className="py-3 flex flex-col gap-1.5">
          {items}
          {conversation.is_typing && <TypingBubble />}
          <div ref={endRef} />
        </div>
      )}
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex justify-end px-2">
      <div className="max-w-[65%]">
        <div
          className="relative wa-bubble wa-tail-out rounded-tr-none shadow-sm px-3 py-2.5 inline-flex items-center gap-1"
          style={{
            background: "var(--wa-bubble-out)",
            borderRadius: 8,
            minWidth: 56,
          }}
        >
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="block w-1.5 h-1.5 rounded-full"
              style={{
                background: "rgba(255,255,255,0.85)",
                animation: "wa-typing 1.2s infinite ease-in-out",
                animationDelay: `${i * 0.18}s`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
