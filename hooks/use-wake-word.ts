"use client";

import { useEffect, useRef, useCallback, useState } from "react";

/**
 * Always-on background SpeechRecognition that listens for "hey voxi".
 * When detected, fires `onWake` callback and pauses briefly before restarting.
 *
 * This runs separately from the push-to-talk voice input used by TutorChat.
 */

interface UseWakeWordOptions {
  /** Called when "hey voxi" is detected */
  onWake: () => void;
  /** Disable wake-word listening (e.g. when Voxi is already actively listening) */
  disabled?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSRClass(): (new () => any) | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const WAKE_PHRASES = [
  "hey voxi", "hey voxie", "hey voxy", "hey roxy", "a voxi", "hey foxy", "hey boxy",
  "hey vozy", "hey vaxi", "ok voxi", "okay voxi",
];
const ROLLING_SIZE = 5; // check last N results together (speech often splits "hey voxi")

export function useWakeWord({ onWake, disabled }: UseWakeWordOptions) {
  const [isSupported] = useState(() => getSRClass() !== null);
  const recognitionRef = useRef<ReturnType<typeof Object.create>>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onWakeRef = useRef(onWake);
  onWakeRef.current = onWake;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const stop = useCallback(() => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* noop */ }
      recognitionRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    const SRClass = getSRClass();
    if (!SRClass || disabledRef.current) return;
    stop();

    const rec = new SRClass();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    recognitionRef.current = rec;

    const recentTranscripts: string[] = [];
    rec.onresult = (event: { results: { length: number; [i: number]: { [j: number]: { transcript: string } } } }) => {
      for (let i = 0; i < event.results.length; i++) {
        const text = (event.results[i][0]?.transcript ?? "").toLowerCase().trim();
        if (!text) continue;
        recentTranscripts.push(text);
        if (recentTranscripts.length > ROLLING_SIZE) recentTranscripts.shift();
        const combined = recentTranscripts.join(" ").replace(/\s+/g, " ").trim();
        const found = WAKE_PHRASES.some((phrase) => combined.includes(phrase));
        if (found) {
          stop();
          onWakeRef.current();
          restartTimerRef.current = setTimeout(() => {
            if (!disabledRef.current) start();
          }, 10000);
          return;
        }
      }
    };

    rec.onerror = () => {
      // Restart on error after a brief pause
      restartTimerRef.current = setTimeout(() => {
        if (!disabledRef.current) start();
      }, 2000);
    };

    rec.onend = () => {
      // SpeechRecognition auto-stops periodically; restart it
      if (!disabledRef.current && recognitionRef.current === rec) {
        restartTimerRef.current = setTimeout(() => {
          if (!disabledRef.current) start();
        }, 500);
      }
    };

    try {
      rec.start();
    } catch {
      // Browser may block if another recognition is active
      restartTimerRef.current = setTimeout(() => {
        if (!disabledRef.current) start();
      }, 3000);
    }
  }, [stop]);

  useEffect(() => {
    if (disabled) {
      stop();
    } else if (isSupported) {
      start();
    }
    return stop;
  }, [disabled, isSupported, start, stop]);

  return { isSupported };
}
