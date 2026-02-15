"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/*  Browser STT via SpeechRecognition (push-to-talk)                  */
/* ------------------------------------------------------------------ */

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

function getSpeechRecognitionClass(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface UseVoiceInputReturn {
  isSupported: boolean;
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  startListening: () => void;
  stopListening: () => void;
  clearTranscript: () => void;
}

const TIMEOUT_MS = 15_000;
const SILENCE_MS = 3_000;

export function useVoiceInput(): UseVoiceInputReturn {
  const [isSupported] = useState(() => getSpeechRecognitionClass() !== null);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accumulatedRef = useRef("");
  const sessionIdRef = useRef(0);

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    if (silenceRef.current) { clearTimeout(silenceRef.current); silenceRef.current = null; }
  }, []);

  const stopListening = useCallback(() => {
    clearTimers();
    const rec = recognitionRef.current;
    if (rec) {
      try { rec.stop(); } catch { /* already stopped */ }
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimTranscript("");
  }, [clearTimers]);

  const startListening = useCallback(() => {
    const SRClass = getSpeechRecognitionClass();
    if (!SRClass) return;

    const thisSession = ++sessionIdRef.current;
    const rec = recognitionRef.current;
    if (rec) { try { rec.abort(); } catch { /* noop */ } recognitionRef.current = null; }
    clearTimers();

    accumulatedRef.current = "";
    setTranscript("");
    setInterimTranscript("");

    const recognition = new SRClass();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      if (sessionIdRef.current !== thisSession) return;
      let interim = "";
      let accumulated = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) { accumulated += result[0].transcript; }
        else { interim += result[0].transcript; }
      }
      if (accumulated) {
        accumulatedRef.current = accumulated.trim();
        setTranscript(accumulatedRef.current);
        setInterimTranscript(interim);
        if (silenceRef.current) clearTimeout(silenceRef.current);
        silenceRef.current = setTimeout(() => {
          if (sessionIdRef.current === thisSession) stopListening();
        }, SILENCE_MS);
      } else {
        setInterimTranscript(interim);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (sessionIdRef.current !== thisSession) return;
      if (event.error !== "aborted" && event.error !== "no-speech") {
        console.warn("SpeechRecognition error:", event.error);
      }
      if (event.error === "no-speech") return;
      setIsListening(false);
      clearTimers();
    };

    recognition.onend = () => {
      if (sessionIdRef.current !== thisSession) return;
      setIsListening(false);
      setInterimTranscript("");
      clearTimers();
    };

    try {
      recognition.start();
      setIsListening(true);
    } catch (err) {
      console.warn("Failed to start SpeechRecognition:", err);
      setIsListening(false);
      return;
    }

    timeoutRef.current = setTimeout(() => {
      if (sessionIdRef.current === thisSession) stopListening();
    }, TIMEOUT_MS);
  }, [stopListening, clearTimers]);

  const clearTranscript = useCallback(() => {
    accumulatedRef.current = "";
    setTranscript("");
    setInterimTranscript("");
  }, []);

  useEffect(() => {
    return () => {
      clearTimers();
      if (recognitionRef.current) { try { recognitionRef.current.abort(); } catch { /* noop */ } }
    };
  }, [clearTimers]);

  return { isSupported, isListening, transcript, interimTranscript, startListening, stopListening, clearTranscript };
}
