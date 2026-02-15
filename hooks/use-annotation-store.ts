"use client";

import { createContext, useContext, useCallback, useRef } from "react";

/**
 * Lightweight store that lets ImageAnnotator save the latest annotated image
 * and lets Voxi read it when the user says "analyze/explain this".
 */

export interface AnnotationData {
  /** Composited image (original + drawings) as base64 data URL */
  imageDataUrl: string;
  /** What the user drew: "highlighted a rectangular area of", etc. */
  annotationType: string;
  /** Image alt / label */
  alt: string;
  /** Timestamp so Voxi knows how fresh it is */
  timestamp: number;
}

export interface AnnotationStore {
  /** Called by ImageAnnotator after drawing */
  setAnnotation: (data: Omit<AnnotationData, "timestamp">) => void;
  /** Called by Voxi to get the latest annotation */
  getAnnotation: () => AnnotationData | null;
  /** Clear after use */
  clearAnnotation: () => void;
}

/** React context to pass the store through the component tree */
export const AnnotationStoreContext = createContext<AnnotationStore | null>(null);

/** Hook used by ImageAnnotator and Voxi to access the store */
export function useAnnotationStore(): AnnotationStore {
  const ctx = useContext(AnnotationStoreContext);
  if (!ctx) {
    // Fallback: return a no-op store so components don't crash outside the provider
    return {
      setAnnotation: () => {},
      getAnnotation: () => null,
      clearAnnotation: () => {},
    };
  }
  return ctx;
}

/** Hook to create the store value (used once in WorkspacePage) */
export function useCreateAnnotationStore(): AnnotationStore {
  const dataRef = useRef<AnnotationData | null>(null);

  const setAnnotation = useCallback(
    (data: Omit<AnnotationData, "timestamp">) => {
      dataRef.current = { ...data, timestamp: Date.now() };
    },
    []
  );

  const getAnnotation = useCallback(() => {
    const d = dataRef.current;
    if (!d) return null;
    // Only return if annotation is less than 5 minutes old
    if (Date.now() - d.timestamp > 5 * 60 * 1000) {
      dataRef.current = null;
      return null;
    }
    return d;
  }, []);

  const clearAnnotation = useCallback(() => {
    dataRef.current = null;
  }, []);

  return { setAnnotation, getAnnotation, clearAnnotation };
}
