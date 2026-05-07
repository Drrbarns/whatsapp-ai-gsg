"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Sidebar } from "@/components/Sidebar";
import { ChatHeader } from "@/components/ChatHeader";
import { MessageList } from "@/components/MessageList";
import { Composer } from "@/components/Composer";
import { ImageLightbox } from "@/components/ImageLightbox";
import type { ConversationWithLastMessage, Message } from "@/lib/types";

export default function Dashboard() {
  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  }, []);

  const [conversations, setConversations] = useState<ConversationWithLastMessage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [lightbox, setLightbox] = useState<{ src: string; name: string | null } | null>(
    null
  );

  // Used to ignore stale fetches when switching chats quickly
  const fetchTokenRef = useRef(0);

  const selected = conversations.find((c) => c.id === selectedId) || null;

  const fetchConversations = useCallback(async () => {
    const res = await fetch("/api/conversations");
    if (!res.ok) return;
    const data = (await res.json()) as ConversationWithLastMessage[];
    setConversations(data);
  }, []);

  const fetchMessages = useCallback(async (convoId: string) => {
    const myToken = ++fetchTokenRef.current;
    const res = await fetch(`/api/conversations/${convoId}/messages`);
    if (!res.ok) return;
    const data = (await res.json()) as Message[];
    if (myToken !== fetchTokenRef.current) return;
    setMessages(data);
  }, []);

  // Mark as read when switching to a chat
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!selectedId) return;
    void fetchMessages(selectedId);
    void fetch(`/api/conversations/${selectedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markRead: true }),
    }).then(() => {
      setConversations((prev) =>
        prev.map((c) => (c.id === selectedId ? { ...c, unread_count: 0 } : c))
      );
    });
  }, [selectedId, fetchMessages]);

  useEffect(() => {
    void fetchConversations();
  }, [fetchConversations]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Realtime: incoming messages + conversation updates
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel("realtime-messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const newMsg = payload.new as Message;
          if (newMsg.conversation_id === selectedId) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
          }
          fetchConversations();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        (payload) => {
          const updated = payload.new as Message;
          if (updated.conversation_id === selectedId) {
            setMessages((prev) =>
              prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m))
            );
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => fetchConversations()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, selectedId, fetchConversations]);

  async function toggleMode() {
    if (!selected) return;
    const newMode = selected.mode === "agent" ? "human" : "agent";
    await fetch(`/api/conversations/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: newMode }),
    });
    setConversations((prev) =>
      prev.map((c) => (c.id === selected.id ? { ...c, mode: newMode } : c))
    );
  }

  async function handleSendText(text: string) {
    if (!selectedId) return;
    // Optimistic
    const optimistic: Message = {
      id: `tmp-${Date.now()}`,
      conversation_id: selectedId,
      role: "assistant",
      content: text,
      media_url: null,
      media_type: null,
      media_mime: null,
      media_filename: null,
      media_size_bytes: null,
      media_duration_secs: null,
      status: "queued",
      reply_to: null,
      whatsapp_msg_id: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      const res = await fetch(`/api/conversations/${selectedId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const saved = (await res.json()) as Message;
      setMessages((prev) =>
        prev.map((m) => (m.id === optimistic.id ? saved : m))
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === optimistic.id ? { ...m, status: "failed" as const } : m
        )
      );
    }
  }

  async function handleSendFile(
    file: File,
    opts: { caption?: string; isVoice?: boolean; durationSecs?: number; asSticker?: boolean }
  ) {
    if (!selectedId) return;
    const form = new FormData();
    form.append("file", file);
    if (opts.caption) form.append("caption", opts.caption);
    if (opts.isVoice) form.append("isVoice", "true");
    if (opts.asSticker) form.append("asSticker", "true");
    if (opts.durationSecs != null)
      form.append("durationSecs", String(opts.durationSecs));

    const res = await fetch(`/api/conversations/${selectedId}/send-media`, {
      method: "POST",
      body: form,
    });
    if (res.ok) {
      const data = (await res.json()) as { message: Message };
      setMessages((prev) =>
        prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message]
      );
    }
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--wa-bg)" }}>
      <Sidebar
        conversations={conversations}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />

      <main className="flex-1 flex flex-col min-w-0 relative">
        {!selected ? (
          <EmptyState />
        ) : (
          <>
            <ChatHeader conversation={selected} onToggleMode={toggleMode} />
            <MessageList
              messages={messages}
              conversation={selected}
              onOpenImage={(src, name) => setLightbox({ src, name })}
            />
            <Composer
              conversationId={selected.id}
              onSendText={handleSendText}
              onSendFile={handleSendFile}
            />
          </>
        )}
      </main>

      {lightbox && (
        <ImageLightbox
          src={lightbox.src}
          filename={lightbox.name}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="flex-1 flex flex-col items-center justify-center wa-doodle"
      style={{ borderTop: "6px solid var(--wa-green)" }}
    >
      <div
        className="text-center max-w-md px-8 py-10 rounded-xl"
        style={{ background: "rgba(11,20,26,0.55)" }}
      >
        <div
          className="w-32 h-32 mx-auto rounded-full flex items-center justify-center mb-6"
          style={{ background: "rgba(0, 168, 132, 0.12)" }}
        >
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--wa-green)"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <h2 className="text-2xl font-light" style={{ color: "var(--wa-text)" }}>
          WhatsApp AI Agent
        </h2>
        <p className="text-sm mt-3" style={{ color: "var(--wa-text-secondary)" }}>
          Send and receive messages, voice notes, photos, and documents — with an
          AI agent that auto-replies, or take over manually any time.
        </p>
        <p
          className="text-xs mt-6 pt-4 border-t"
          style={{
            color: "var(--wa-text-tertiary)",
            borderColor: "var(--wa-divider)",
          }}
        >
          End-to-end your data — chats are stored in your Supabase project.
        </p>
      </div>
    </div>
  );
}
