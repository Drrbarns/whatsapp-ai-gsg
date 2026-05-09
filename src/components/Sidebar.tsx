"use client";

import React, { useMemo, useState } from "react";
import { Avatar } from "@/components/Avatar";
import {
  DoubleTickIcon,
  FilterIcon,
  MoreIcon,
  NewChatIcon,
  SearchIcon,
} from "@/components/icons";
import { formatChatListTime } from "@/lib/format";
import type { ConversationWithLastMessage } from "@/lib/types";

export function Sidebar({
  conversations,
  selectedId,
  onSelect,
}: {
  conversations: ConversationWithLastMessage[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "ai" | "human">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter((c) => {
      if (q) {
        const hay = `${c.name || ""} ${c.phone} ${c.last_message || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filter === "unread" && (c.unread_count ?? 0) === 0) return false;
      if (filter === "ai" && c.mode !== "agent") return false;
      if (filter === "human" && c.mode !== "human") return false;
      return true;
    });
  }, [conversations, query, filter]);

  return (
    <aside
      className="w-full md:w-[400px] flex flex-col border-r flex-shrink-0"
      style={{ background: "var(--wa-panel)", borderColor: "var(--wa-divider)" }}
    >
      {/* Top bar with profile + actions */}
      <div
        className="flex items-center justify-between px-4 h-[60px]"
        style={{ background: "var(--wa-header)" }}
      >
        <div className="flex items-center gap-3">
          <Avatar name="AI" phone="agent" size={40} />
          <div className="leading-tight">
            <div className="text-sm font-semibold" style={{ color: "var(--wa-text)" }}>
              WhatsApp AI Agent
            </div>
            <div className="text-[11px]" style={{ color: "var(--wa-text-secondary)" }}>
              {conversations.length} chat{conversations.length !== 1 ? "s" : ""}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1" style={{ color: "var(--wa-text-secondary)" }}>
          <IconBtn title="New chat"><NewChatIcon size={20} /></IconBtn>
          <IconBtn title="Menu"><MoreIcon size={20} /></IconBtn>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2" style={{ background: "var(--wa-panel)" }}>
        <div
          className="flex items-center gap-3 rounded-lg px-3 h-9"
          style={{ background: "var(--wa-input)" }}
        >
          <SearchIcon size={16} style={{ color: "var(--wa-text-secondary)" }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search or start new chat"
            className="flex-1 bg-transparent text-sm focus:outline-none"
            style={{ color: "var(--wa-text)" }}
          />
          <button
            type="button"
            title="Filter"
            className="p-0.5 rounded hover:opacity-80"
            style={{ color: "var(--wa-text-secondary)" }}
            onClick={() =>
              setFilter((f) =>
                f === "all" ? "unread" : f === "unread" ? "ai" : f === "ai" ? "human" : "all"
              )
            }
          >
            <FilterIcon size={16} />
          </button>
        </div>
      </div>

      {/* Filter pills */}
      <div className="px-3 pb-2 flex gap-1.5 flex-wrap">
        {(["all", "unread", "ai", "human"] as const).map((f) => {
          const active = filter === f;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3 py-1 rounded-full text-xs font-medium transition-colors"
              style={{
                background: active ? "rgba(0, 168, 132, 0.18)" : "var(--wa-input)",
                color: active ? "var(--wa-green)" : "var(--wa-text-secondary)",
              }}
            >
              {f === "all" ? "All" : f === "unread" ? "Unread" : f === "ai" ? "AI" : "Human"}
            </button>
          );
        })}
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <div
            className="text-center text-xs py-12"
            style={{ color: "var(--wa-text-tertiary)" }}
          >
            {conversations.length === 0
              ? "No conversations yet — send your bot a message on WhatsApp"
              : "No chats match this filter"}
          </div>
        )}
        {filtered.map((c) => {
          const selected = c.id === selectedId;
          const unread = c.unread_count ?? 0;
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className="w-full text-left px-3 py-3 flex items-center gap-3 transition-colors"
              style={{
                background: selected ? "var(--wa-row-selected)" : "transparent",
                borderTop: "1px solid transparent",
              }}
              onMouseEnter={(e) => {
                if (!selected) e.currentTarget.style.background = "var(--wa-row-hover)";
              }}
              onMouseLeave={(e) => {
                if (!selected) e.currentTarget.style.background = "transparent";
              }}
            >
              <Avatar name={c.name} phone={c.phone} size={49} />
              <div className="flex-1 min-w-0 border-b pb-3" style={{ borderColor: "var(--wa-divider)" }}>
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-[15px] font-normal truncate"
                    style={{ color: "var(--wa-text)" }}
                  >
                    {c.name || c.phone}
                  </span>
                  <span
                    className="text-[12px] flex-shrink-0"
                    style={{
                      color: unread > 0 ? "var(--wa-green)" : "var(--wa-text-tertiary)",
                    }}
                  >
                    {formatChatListTime(c.updated_at)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <div className="flex items-center gap-1 min-w-0 flex-1">
                    {c.is_typing ? (
                      <span
                        className="text-[13px] italic truncate"
                        style={{ color: "var(--wa-green)" }}
                      >
                        AI is typing…
                      </span>
                    ) : (
                      <>
                        {c.last_message_type && c.last_message_type !== "text" && (
                          <MediaTypeBadge type={c.last_message_type} />
                        )}
                        <span
                          className="text-[13px] truncate"
                          style={{ color: "var(--wa-text-secondary)" }}
                        >
                          {c.last_message || (c.name ? c.phone : "")}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                      style={{
                        background:
                          c.mode === "agent"
                            ? "rgba(0, 168, 132, 0.18)"
                            : "rgba(245, 158, 11, 0.18)",
                        color: c.mode === "agent" ? "var(--wa-green)" : "#f59e0b",
                      }}
                    >
                      {c.mode === "agent" ? "AI" : "YOU"}
                    </span>
                    {unread > 0 && (
                      <span
                        className="text-[11px] font-semibold rounded-full min-w-5 h-5 px-1.5 flex items-center justify-center"
                        style={{ background: "var(--wa-green)", color: "#fff" }}
                      >
                        {unread > 99 ? "99+" : unread}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
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

function MediaTypeBadge({ type }: { type: string }) {
  const iconStyle = { color: "var(--wa-text-secondary)" };
  if (type === "image")
    return <span style={iconStyle} className="text-[13px]">📷</span>;
  if (type === "video")
    return <span style={iconStyle} className="text-[13px]">🎥</span>;
  if (type === "voice")
    return <span style={iconStyle} className="text-[13px]">🎤</span>;
  if (type === "audio")
    return <span style={iconStyle} className="text-[13px]">🎵</span>;
  if (type === "document")
    return <span style={iconStyle} className="text-[13px]">📎</span>;
  return <DoubleTickIcon size={14} style={iconStyle} />;
}
