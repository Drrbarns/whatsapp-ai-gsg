"use client";

import React, { useEffect, useRef, useState } from "react";
import { MicIcon, PauseIcon, PlayIcon, SendIcon, TrashIcon } from "@/components/icons";
import { formatDuration } from "@/lib/format";

export type VoiceRecorderHandle = {
  start: () => Promise<void>;
};

export function VoiceRecorder({
  onCancel,
  onSend,
  active,
}: {
  active: boolean;
  onCancel: () => void;
  onSend: (blob: Blob, mime: string, durationSecs: number) => Promise<void>;
}) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const intervalRef = useRef<number | null>(null);

  const [seconds, setSeconds] = useState(0);
  const [recording, setRecording] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewMime, setPreviewMime] = useState<string>("audio/webm");
  const [previewDuration, setPreviewDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const previewAudio = useRef<HTMLAudioElement | null>(null);

  function pickMime(): string {
    const candidates = [
      "audio/ogg;codecs=opus",
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
    ];
    for (const c of candidates) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) {
        return c;
      }
    }
    return "audio/webm";
  }

  async function start() {
    if (recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMime();
      const rec = new MediaRecorder(stream, { mimeType: mime });
      recorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime });
        const url = URL.createObjectURL(blob);
        setPreviewBlob(blob);
        setPreviewMime(mime);
        setPreviewUrl(url);
      };
      rec.start();
      startedAtRef.current = Date.now();
      setSeconds(0);
      setRecording(true);
      intervalRef.current = window.setInterval(() => {
        setSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }, 250);
    } catch (e) {
      console.error("mic error", e);
      alert("Microphone access denied. Allow mic permission to record voice notes.");
      onCancel();
    }
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setPreviewDuration(seconds);
    setRecording(false);
  }

  function cancel() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewBlob(null);
    setSeconds(0);
    setRecording(false);
    onCancel();
  }

  async function send() {
    if (!previewBlob) return;
    await onSend(previewBlob, previewMime, previewDuration);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewBlob(null);
    setSeconds(0);
  }

  function togglePlay() {
    const a = previewAudio.current;
    if (!a) return;
    if (a.paused) {
      a.play();
      setPlaying(true);
    } else {
      a.pause();
      setPlaying(false);
    }
  }

  // Auto-start when activated
  useEffect(() => {
    if (active && !recording && !previewUrl) {
      start();
    }
    if (!active) {
      // cleanup if parent deactivates
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (!active) return null;

  return (
    <div
      className="flex items-center gap-3 w-full h-12 rounded-lg px-3"
      style={{ background: "var(--wa-input)" }}
    >
      <button
        type="button"
        onClick={cancel}
        title="Discard"
        className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/[0.06]"
        style={{ color: "#ef4444" }}
      >
        <TrashIcon size={20} />
      </button>

      {recording ? (
        <>
          <span
            className="w-3 h-3 rounded-full wa-recording-dot"
            style={{ background: "#ef4444" }}
          />
          <span className="text-sm tabular-nums" style={{ color: "var(--wa-text)" }}>
            {formatDuration(seconds)}
          </span>
          <span className="flex-1 text-xs" style={{ color: "var(--wa-text-secondary)" }}>
            Recording…
          </span>
          <button
            type="button"
            onClick={stopRecording}
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: "var(--wa-green)", color: "#fff" }}
            title="Stop recording"
          >
            <PauseIcon size={18} />
          </button>
        </>
      ) : (
        <>
          {previewUrl && (
            <>
              <audio
                ref={previewAudio}
                src={previewUrl}
                onEnded={() => setPlaying(false)}
              />
              <button
                type="button"
                onClick={togglePlay}
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{ color: "var(--wa-text)" }}
              >
                {playing ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
              </button>
              <span className="text-sm tabular-nums" style={{ color: "var(--wa-text)" }}>
                {formatDuration(previewDuration)}
              </span>
              <span className="flex-1 text-xs" style={{ color: "var(--wa-text-secondary)" }}>
                Preview · ready to send
              </span>
            </>
          )}
          <button
            type="button"
            onClick={send}
            disabled={!previewBlob}
            className="w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-50"
            style={{ background: "var(--wa-green)", color: "#fff" }}
            title="Send voice note"
          >
            <SendIcon size={16} />
          </button>
        </>
      )}
    </div>
  );
}

// Hook helper to keep a record button visually consistent in composer
export function MicButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/[0.06]"
      style={{ color: "var(--wa-text-secondary)" }}
      title="Voice message"
    >
      <MicIcon size={22} />
    </button>
  );
}
