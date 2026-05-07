"use client";

import React, { useEffect, useRef } from "react";

const EMOJI: Record<string, string[]> = {
  "Smileys": ["😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😊","😇","🥰","😍","🤩","😘","😗","😚","😙","😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫","🤔"],
  "Gestures": ["👍","👎","👌","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","🖕","👇","☝️","👋","🤚","🖐️","✋","🖖","👏","🙌","🙏","💪","🫶","🤝"],
  "Hearts": ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟"],
  "Objects": ["🔥","✨","⭐","🌟","💫","💥","💯","✅","❌","⚠️","🎉","🎊","🎁","🎈","🍕","🍔","🍟","☕","🍺","🍷","🚀","📞","📱","💻","⏰","🎵","🎶","📷","📎","📍"],
  "Nature": ["🌸","🌺","🌻","🌹","🌷","🌼","🌱","🌿","🍀","🍃","🌳","🌴","🌊","☀️","🌙","⭐","☁️","🌈","❄️","⚡","🔥","💧"],
};

export function EmojiPicker({
  onPick,
  onClose,
}: {
  onPick: (emoji: string) => void;
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

  return (
    <div
      ref={ref}
      className="absolute bottom-14 left-0 w-[340px] max-h-[340px] overflow-y-auto rounded-lg shadow-xl z-30 p-2"
      style={{ background: "var(--wa-header)", border: "1px solid var(--wa-divider)" }}
    >
      {Object.entries(EMOJI).map(([cat, list]) => (
        <div key={cat} className="mb-2">
          <div
            className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1"
            style={{ color: "var(--wa-text-tertiary)" }}
          >
            {cat}
          </div>
          <div className="grid grid-cols-8 gap-0.5">
            {list.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => onPick(e)}
                className="w-9 h-9 flex items-center justify-center text-xl rounded hover:bg-white/[0.06]"
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
