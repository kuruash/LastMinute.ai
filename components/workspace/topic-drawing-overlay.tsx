"use client";

import {
  useRef,
  useState,
  useCallback,
  useEffect,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { Eraser, X } from "lucide-react";
import { useAnnotationStore } from "@/hooks/use-annotation-store";

interface Point {
  x: number;
  y: number;
}

interface TopicDrawingOverlayProps {
  /** Ref to the lesson column div — we capture this so Voxi sees exactly what the user circled */
  captureContainerRef?: React.RefObject<HTMLDivElement | null>;
  /** Fallback when capture isn't available */
  currentSlideImage: { src: string; alt: string } | null;
  /** Call when user wants to exit draw mode (scroll, Done button) */
  onExit?: () => void;
}

/**
 * Full-size overlay on the lesson/topic area. User can draw anywhere on the topic.
 * On stroke end we capture the actual lesson area (what the user sees) and composite
 * the drawing on top, so Voxi gets the correct context — not a wrong slide image.
 */
export function TopicDrawingOverlay({
  captureContainerRef,
  currentSlideImage,
  onExit,
}: TopicDrawingOverlayProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const annotationStore = useAnnotationStore();

  const [isDrawing, setIsDrawing] = useState(false);
  const pathsRef = useRef<Point[][]>([]);
  const currentPathRef = useRef<Point[]>([]);

  const syncCanvas = useCallback(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;
    const rect = wrapper.getBoundingClientRect();
    canvas.width = Math.floor(rect.width);
    canvas.height = Math.floor(rect.height);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    redraw();
  }, []);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "rgba(255, 60, 60, 0.8)";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const path of pathsRef.current) {
      if (path.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i].x, path[i].y);
      }
      ctx.stroke();
    }
  }, []);

  useEffect(() => {
    syncCanvas();
    const ro = new ResizeObserver(syncCanvas);
    if (wrapperRef.current) ro.observe(wrapperRef.current);
    window.addEventListener("resize", syncCanvas);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", syncCanvas);
    };
  }, [syncCanvas]);

  const getPos = useCallback(
    (e: ReactMouseEvent | ReactTouchEvent | MouseEvent | TouchEvent): Point => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return { x: 0, y: 0 };
      const rect = wrapper.getBoundingClientRect();
      let clientX: number, clientY: number;
      if ("touches" in e) {
        const touch = e.touches[0] || (e as TouchEvent).changedTouches?.[0];
        clientX = touch?.clientX ?? 0;
        clientY = touch?.clientY ?? 0;
      } else {
        clientX = (e as MouseEvent).clientX;
        clientY = (e as MouseEvent).clientY;
      }
      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
    },
    []
  );

  const saveToStore = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const hasDrawing = pathsRef.current.some((p) => p.length >= 2);
    if (!hasDrawing) return;

    const w = canvas.width;
    const h = canvas.height;
    const paths = pathsRef.current;

    const drawPathsOnCtx = (ctx: CanvasRenderingContext2D, scaleX: number, scaleY: number) => {
      ctx.strokeStyle = "rgba(255, 60, 60, 0.9)";
      ctx.lineWidth = Math.max(2, 4 * Math.min(scaleX, scaleY));
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const path of paths) {
        if (path.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(path[0].x * scaleX, path[0].y * scaleY);
        for (let i = 1; i < path.length; i++) {
          ctx.lineTo(path[i].x * scaleX, path[i].y * scaleY);
        }
        ctx.stroke();
      }
    };

    /** Bounding box of all paths in overlay coords; add padding for crop */
    const PAD = 12;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const path of paths) {
      for (const pt of path) {
        minX = Math.min(minX, pt.x);
        minY = Math.min(minY, pt.y);
        maxX = Math.max(maxX, pt.x);
        maxY = Math.max(maxY, pt.y);
      }
    }
    const cropX0 = Math.max(0, minX - PAD);
    const cropY0 = Math.max(0, minY - PAD);
    const cropX1 = Math.min(w, maxX + PAD);
    const cropY1 = Math.min(h, maxY + PAD);
    const cropW = cropX1 - cropX0;
    const cropH = cropY1 - cropY0;
    if (cropW < 20 || cropH < 20) return;

    const container = captureContainerRef?.current;
    if (container && typeof window !== "undefined") {
      import("html2canvas").then(({ default: html2canvas }) => {
        const scrollEl = container.firstElementChild as HTMLElement | null;
        const hasScroll =
          scrollEl &&
          scrollEl.scrollHeight > scrollEl.clientHeight;
        const scrollTop = hasScroll ? scrollEl.scrollTop : 0;
        const scrollLeft = hasScroll ? scrollEl.scrollLeft : 0;
        const vw = hasScroll ? scrollEl.clientWidth : container.clientWidth;
        const vh = hasScroll ? scrollEl.clientHeight : container.clientHeight;

        html2canvas(container, {
          useCORS: true,
          allowTaint: true,
          logging: false,
          scale: 1,
        })
          .then((captured) => {
            const cw = captured.width;
            const ch = captured.height;
            let targetCanvas: HTMLCanvasElement;
            let targetCtx: CanvasRenderingContext2D | null;

            const contentW = scrollEl?.scrollWidth ?? cw;
            const contentH = scrollEl?.scrollHeight ?? ch;
            if (ch > vh + 10 || cw > vw + 10) {
              const scaleX = cw / contentW;
              const scaleY = ch / contentH;
              const sx = scrollLeft * scaleX;
              const sy = scrollTop * scaleY;
              const sw = vw * scaleX;
              const sh = vh * scaleY;
              targetCanvas = document.createElement("canvas");
              targetCanvas.width = vw;
              targetCanvas.height = vh;
              targetCtx = targetCanvas.getContext("2d");
              if (targetCtx) {
                targetCtx.drawImage(
                  captured,
                  sx, sy, sw, sh,
                  0, 0, vw, vh
                );
              }
            } else {
              targetCanvas = captured;
              targetCtx = captured.getContext("2d");
            }

            if (!targetCtx) return fallbackSave();
            const scaleX = targetCanvas.width / w;
            const scaleY = targetCanvas.height / h;
            const sx0 = cropX0 * scaleX;
            const sy0 = cropY0 * scaleY;
            const sw = cropW * scaleX;
            const sh = cropH * scaleY;
            const cropCanvas = document.createElement("canvas");
            cropCanvas.width = Math.max(1, Math.round(sw));
            cropCanvas.height = Math.max(1, Math.round(sh));
            const cropCtx = cropCanvas.getContext("2d");
            if (!cropCtx) return fallbackSave();
            cropCtx.drawImage(targetCanvas, sx0, sy0, sw, sh, 0, 0, cropCanvas.width, cropCanvas.height);
            const dataUrl = cropCanvas.toDataURL("image/png");
            annotationStore.setAnnotation({
              imageDataUrl: dataUrl,
              annotationType: "cropped region",
              alt: currentSlideImage?.alt ?? "Selected region",
            });
          })
          .catch(() => fallbackSave());
      }).catch(() => fallbackSave());
      return;
    }

    function fallbackSave() {
      if (currentSlideImage?.src) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          const out = document.createElement("canvas");
          out.width = img.naturalWidth;
          out.height = img.naturalHeight;
          const ctx = out.getContext("2d");
          if (!ctx) return;
          ctx.drawImage(img, 0, 0);
          const scaleX = out.width / w;
          const scaleY = out.height / h;
          drawPathsOnCtx(ctx, scaleX, scaleY);
          annotationStore.setAnnotation({
            imageDataUrl: out.toDataURL("image/png"),
            annotationType: "drawn on",
            alt: currentSlideImage.alt,
          });
        };
        img.src = currentSlideImage.src;
      } else {
        const out = document.createElement("canvas");
        out.width = w;
        out.height = h;
        const ctx = out.getContext("2d");
        if (!ctx) return;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, w, h);
        drawPathsOnCtx(ctx, 1, 1);
        annotationStore.setAnnotation({
          imageDataUrl: out.toDataURL("image/png"),
          annotationType: "drawn on",
          alt: "Topic",
        });
      }
    }

    fallbackSave();
  }, [captureContainerRef, currentSlideImage, annotationStore]);

  const handlePointerDown = useCallback(
    (e: ReactMouseEvent | ReactTouchEvent) => {
      e.preventDefault();
      const pos = getPos(e);
      setIsDrawing(true);
      currentPathRef.current = [pos];
    },
    [getPos]
  );

  const handlePointerMove = useCallback(
    (e: ReactMouseEvent | ReactTouchEvent) => {
      if (!isDrawing) return;
      e.preventDefault();
      const pos = getPos(e);
      currentPathRef.current.push(pos);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      redraw();
      const path = currentPathRef.current;
      if (path.length >= 2) {
        ctx.strokeStyle = "rgba(255, 60, 60, 0.8)";
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) {
          ctx.lineTo(path[i].x, path[i].y);
        }
        ctx.stroke();
      }
    },
    [isDrawing, getPos, redraw]
  );

  const handlePointerUp = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (currentPathRef.current.length >= 2) {
      pathsRef.current.push([...currentPathRef.current]);
    }
    currentPathRef.current = [];
    saveToStore();
  }, [isDrawing, saveToStore]);

  /** Scroll exits draw mode so the topic can scroll */
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      onExit?.();
    },
    [onExit]
  );

  const clearAll = useCallback(() => {
    pathsRef.current = [];
    currentPathRef.current = [];
    redraw();
    annotationStore.clearAnnotation();
  }, [redraw, annotationStore]);

  return (
    <div
      ref={wrapperRef}
      className="absolute inset-0 z-10 cursor-crosshair"
      onMouseDown={handlePointerDown}
      onMouseMove={handlePointerMove}
      onMouseUp={handlePointerUp}
      onMouseLeave={handlePointerUp}
      onTouchStart={handlePointerDown}
      onTouchMove={handlePointerMove}
      onTouchEnd={handlePointerUp}
      onWheel={handleWheel}
    >
      <canvas
        ref={canvasRef}
        className="absolute left-0 top-0 pointer-events-none"
        style={{ width: "100%", height: "100%" }}
      />

      {/* Toolbar: Done (exit) + Eraser (clear) */}
      <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-lg border border-border bg-background/95 px-2 py-1.5 shadow-sm backdrop-blur-sm">
        <button
          type="button"
          onClick={clearAll}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Clear drawing"
        >
          <Eraser className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onExit}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Done (exit draw mode)"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Hint: scroll to exit */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md border border-border bg-background/90 px-2.5 py-1 text-[10px] text-muted-foreground backdrop-blur-sm">
        Scroll to exit · Or tap Done
      </div>
    </div>
  );
}
