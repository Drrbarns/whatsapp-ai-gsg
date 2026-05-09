"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  CloseIcon,
  PaperclipIcon,
  SendIcon,
  SmileIcon,
} from "@/components/icons";
import { EmojiPicker } from "@/components/EmojiPicker";
import { AttachmentMenu, AttachmentChoice } from "@/components/AttachmentMenu";
import { MicButton, VoiceRecorder } from "@/components/VoiceRecorder";

export function Composer({
  conversationId,
  onSendText,
  onSendFile,
}: {
  conversationId: string;
  onSendText: (text: string) => Promise<void>;
  onSendFile: (
    file: File,
    opts: { caption?: string; isVoice?: boolean; durationSecs?: number; asSticker?: boolean }
  ) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [recordingActive, setRecordingActive] = useState(false);
  const [pendingFile, setPendingFile] = useState<
    { file: File; previewUrl: string | null; asSticker?: boolean } | null
  >(null);
  const [caption, setCaption] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const stickerInputRef = useRef<HTMLInputElement>(null);
  const stickerNextRef = useRef(false);

  // Reset on chat switch
  useEffect(() => {
    setText("");
    setRecordingActive(false);
    setPendingFile(null);
    setCaption("");
    setShowAttach(false);
    setShowEmoji(false);
  }, [conversationId]);

  function pickAttachment(choice: AttachmentChoice) {
    if (choice === "document") fileInputRef.current?.click();
    else if (choice === "photo") photoInputRef.current?.click();
    else if (choice === "camera") cameraInputRef.current?.click();
    else if (choice === "video") videoInputRef.current?.click();
    else if (choice === "sticker") {
      stickerNextRef.current = true;
      stickerInputRef.current?.click();
    }
  }

  function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const asSticker = stickerNextRef.current;
    stickerNextRef.current = false;
    const previewUrl = f.type.startsWith("image/") ? URL.createObjectURL(f) : null;
    setPendingFile({ file: f, previewUrl, asSticker });
  }

  function clearPending() {
    if (pendingFile?.previewUrl) URL.revokeObjectURL(pendingFile.previewUrl);
    setPendingFile(null);
    setCaption("");
  }

  async function sendPending() {
    if (!pendingFile || sending) return;
    setSending(true);
    try {
      await onSendFile(pendingFile.file, {
        caption: caption.trim() || undefined,
        asSticker: pendingFile.asSticker,
      });
      clearPending();
    } finally {
      setSending(false);
    }
  }

  async function sendText() {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    setText("");
    try {
      await onSendText(t);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  const showSendButton = text.trim().length > 0;

  // ---------------- Pending media preview overlay ----------------
  if (pendingFile) {
    const isImage = pendingFile.file.type.startsWith("image/");
    const isVideo = pendingFile.file.type.startsWith("video/");
    return (
      <div
        className="absolute inset-0 flex flex-col z-40"
        style={{ background: "rgba(11, 20, 26, 0.96)" }}
      >
        <div
          className="flex items-center justify-between h-14 px-4 flex-shrink-0"
          style={{
            background: "var(--wa-header)",
            paddingTop: "env(safe-area-inset-top, 0px)",
          }}
        >
          <button
            type="button"
            onClick={clearPending}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/[0.06]"
            style={{ color: "var(--wa-text)" }}
          >
            <CloseIcon size={20} />
          </button>
          <span className="text-sm" style={{ color: "var(--wa-text)" }}>
            {isImage ? "Send photo" : isVideo ? "Send video" : "Send document"}
          </span>
          <span className="w-9" />
        </div>
        <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
          {isImage && pendingFile.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pendingFile.previewUrl}
              alt="preview"
              className="max-w-full max-h-[60vh] rounded-lg shadow-2xl"
            />
          ) : isVideo ? (
            <video
              src={URL.createObjectURL(pendingFile.file)}
              controls
              className="max-w-full max-h-[60vh] rounded-lg shadow-2xl"
            />
          ) : (
            <div
              className="rounded-2xl p-10 text-center"
              style={{ background: "var(--wa-header)", color: "var(--wa-text)" }}
            >
              <div
                className="w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-4"
                style={{ background: "var(--wa-input)" }}
              >
                <PaperclipIcon size={32} />
              </div>
              <div className="text-lg font-medium">{pendingFile.file.name}</div>
              <div className="text-sm mt-1" style={{ color: "var(--wa-text-secondary)" }}>
                {pendingFile.file.type || "file"} ·{" "}
                {(pendingFile.file.size / 1024).toFixed(1)} KB
              </div>
            </div>
          )}
        </div>
        <div
          className="flex items-end gap-2 px-3 md:px-4 py-3 flex-shrink-0"
          style={{
            background: "var(--wa-header)",
            paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))",
          }}
        >
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Add a caption…"
            rows={1}
            className="flex-1 min-w-0 resize-none rounded-lg px-4 py-2 text-base md:text-sm focus:outline-none"
            style={{ background: "var(--wa-input)", color: "var(--wa-text)" }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendPending();
              }
            }}
          />
          <button
            type="button"
            onClick={sendPending}
            disabled={sending}
            className="w-12 h-12 rounded-full flex items-center justify-center disabled:opacity-50 flex-shrink-0"
            style={{ background: "var(--wa-green)", color: "#fff" }}
          >
            <SendIcon size={20} />
          </button>
        </div>
      </div>
    );
  }

  // ---------------- Voice recorder mode ----------------
  if (recordingActive) {
    return (
      <div className="px-3 py-2.5" style={{ background: "var(--wa-header)" }}>
        <VoiceRecorder
          active={recordingActive}
          onCancel={() => setRecordingActive(false)}
          onSend={async (blob, mime, durationSecs) => {
            const ext = mime.includes("ogg") ? "ogg" : mime.includes("mp4") ? "m4a" : "webm";
            const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: mime });
            await onSendFile(file, { isVoice: true, durationSecs });
            setRecordingActive(false);
          }}
        />
      </div>
    );
  }

  // ---------------- Default composer ----------------
  return (
    <div
      className="px-2 md:px-3 py-2 md:py-2.5 flex items-end gap-1 md:gap-2 relative"
      style={{
        background: "var(--wa-header)",
        paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))",
      }}
    >
      {showEmoji && (
        <EmojiPicker
          onPick={(e) => setText((t) => t + e)}
          onClose={() => setShowEmoji(false)}
        />
      )}
      {showAttach && (
        <AttachmentMenu onPick={pickAttachment} onClose={() => setShowAttach(false)} />
      )}

      <button
        type="button"
        onClick={() => {
          setShowEmoji((v) => !v);
          setShowAttach(false);
        }}
        className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/[0.06] flex-shrink-0"
        style={{ color: "var(--wa-text-secondary)" }}
        title="Emoji"
      >
        <SmileIcon size={22} />
      </button>
      <button
        type="button"
        onClick={() => {
          setShowAttach((v) => !v);
          setShowEmoji(false);
        }}
        className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/[0.06] flex-shrink-0"
        style={{ color: "var(--wa-text-secondary)" }}
        title="Attach"
      >
        <PaperclipIcon size={22} />
      </button>

      <textarea
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendText();
          }
        }}
        placeholder="Type a message"
        rows={1}
        className="flex-1 min-w-0 max-h-[120px] resize-none rounded-lg px-3 py-2.5 text-base md:text-sm focus:outline-none leading-5"
        style={{ background: "var(--wa-input)", color: "var(--wa-text)" }}
      />

      {showSendButton ? (
        <button
          type="button"
          onClick={sendText}
          disabled={sending}
          className="w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-50 flex-shrink-0"
          style={{ background: "var(--wa-green)", color: "#fff" }}
          title="Send"
        >
          <SendIcon size={18} />
        </button>
      ) : (
        <MicButton onClick={() => setRecordingActive(true)} />
      )}

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={onFilePicked}
      />
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={onFilePicked}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onFilePicked}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={onFilePicked}
      />
      <input
        ref={stickerInputRef}
        type="file"
        accept="image/webp,image/png"
        className="hidden"
        onChange={onFilePicked}
      />
    </div>
  );
}
