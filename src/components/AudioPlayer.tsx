"use client";

import React, { useEffect, useRef, useState } from "react";
import { PauseIcon, PlayIcon } from "@/components/icons";
import { Avatar } from "@/components/Avatar";
import { formatDuration } from "@/lib/format";

// 28 bars; deterministic pseudo-waveform based on src hash so each clip
// has its own visual signature.
function pseudoWaveform(src: string, n = 28): number[] {
  let seed = 0;
  for (let i = 0; i < src.length; i++) seed = (seed * 31 + src.charCodeAt(i)) >>> 0;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const v = (seed % 100) / 100;
    out.push(0.25 + v * 0.75);
  }
  return out;
}

export function AudioPlayer({
  src,
  durationSecs,
  isVoice,
  outgoing,
  authorPhone,
  authorName,
}: {
  src: string;
  durationSecs?: number | null;
  isVoice?: boolean;
  outgoing: boolean;
  authorPhone: string;
  authorName: string | null;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(durationSecs || 0);
  const [rate, setRate] = useState(1);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setTime(a.currentTime || 0);
    const onMeta = () => {
      if (Number.isFinite(a.duration) && a.duration > 0) setDuration(a.duration);
    };
    const onEnd = () => {
      setPlaying(false);
      setTime(0);
    };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("ended", onEnd);
    };
  }, []);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      a.play();
      setPlaying(true);
    } else {
      a.pause();
      setPlaying(false);
    }
  }

  function seek(e: React.ChangeEvent<HTMLInputElement>) {
    const a = audioRef.current;
    if (!a || !duration) return;
    const t = (Number(e.target.value) / 100) * duration;
    a.currentTime = t;
    setTime(t);
  }

  function cycleRate() {
    const a = audioRef.current;
    if (!a) return;
    const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
    a.playbackRate = next;
    setRate(next);
  }

  const progress = duration > 0 ? (time / duration) * 100 : 0;
  const bars = pseudoWaveform(src);
  const playedBars = Math.floor((progress / 100) * bars.length);

  return (
    <div className="flex items-center gap-2.5 w-full md:min-w-[260px]">
      <audio ref={audioRef} src={src} preload="metadata" />
      {isVoice && (
        <Avatar
          name={outgoing ? "AI" : authorName}
          phone={outgoing ? "agent" : authorPhone}
          size={36}
        />
      )}
      <button
        type="button"
        onClick={toggle}
        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ color: "var(--wa-text-secondary)" }}
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="relative h-5 flex items-center">
          {/* Waveform bars */}
          <div className="absolute inset-0 flex items-center gap-[2px] pointer-events-none">
            {bars.map((h, i) => (
              <span
                key={i}
                className="rounded-full"
                style={{
                  flex: 1,
                  height: `${Math.round(h * 18)}px`,
                  background:
                    i < playedBars
                      ? "var(--wa-text)"
                      : "rgba(134,150,160,0.55)",
                  transition: "background 120ms",
                }}
              />
            ))}
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={progress}
            onChange={seek}
            className="wa-range w-full opacity-0"
            aria-label="Seek"
          />
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[11px]" style={{ color: "var(--wa-text-tertiary)" }}>
            {formatDuration(playing || time > 0 ? time : duration)}
          </span>
          <button
            type="button"
            onClick={cycleRate}
            className="text-[10px] font-bold px-1.5 py-0.5 rounded"
            style={{
              color: "var(--wa-text-secondary)",
              background: "rgba(134,150,160,0.18)",
            }}
            title="Playback speed"
          >
            {rate}x
          </button>
        </div>
      </div>
    </div>
  );
}
