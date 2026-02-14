"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, ReactNode, KeyboardEvent } from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  ArrowUpIcon,
  BookOpen,
  Brain,
  ChevronRight,
  FileUp,
  ImageIcon,
  Paperclip,
  PlusIcon,
  Sparkles,
  X,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Auto-resize textarea hook                                         */
/* ------------------------------------------------------------------ */

interface UseAutoResizeTextareaProps {
  minHeight: number;
  maxHeight?: number;
}

function useAutoResizeTextarea({ minHeight, maxHeight }: UseAutoResizeTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(
    (reset?: boolean) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      if (reset) {
        textarea.style.height = `${minHeight}px`;
        return;
      }

      textarea.style.height = `${minHeight}px`;
      const newHeight = Math.max(
        minHeight,
        Math.min(textarea.scrollHeight, maxHeight ?? Number.POSITIVE_INFINITY)
      );
      textarea.style.height = `${newHeight}px`;
    },
    [minHeight, maxHeight]
  );

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) textarea.style.height = `${minHeight}px`;
  }, [minHeight]);

  useEffect(() => {
    const handleResize = () => adjustHeight();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [adjustHeight]);

  return { textareaRef, adjustHeight };
}

/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */

export function VercelV0Chat() {
  const [value, setValue] = useState("");
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [uploadStatus, setUploadStatus] = useState("");
  const [learningOutput, setLearningOutput] = useState<
    Array<{
      filename: string;
      storyText: string;
      llmUsed: boolean;
      llmStatus: string;
      traceNodes: string[];
      concepts: string[];
      checklist: string[];
      storyTitle: string;
      storyOpening: string;
      beats: Array<{
        label: string;
        narrative: string;
        is_decision: boolean;
        choices: string[];
        image_steps: Array<{
          step_label: string;
          prompt: string;
          image_data: string;
        }>;
      }>;
    }>
  >([]);
  const [isUploading, setIsUploading] = useState(false);
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: 60,
    maxHeight: 200,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  /** Stage files when user picks them (don't upload yet). */
  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files ? Array.from(event.target.files) : [];
    if (picked.length === 0) return;
    setStagedFiles((prev) => [...prev, ...picked]);
    event.target.value = "";
  };

  /** Remove a staged file chip. */
  const removeStaged = (index: number) => {
    setStagedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  /** Upload all staged files (called on Enter / Send click). */
  const handleSubmit = async () => {
    if (stagedFiles.length === 0 && !value.trim()) return;

    const filesToUpload = [...stagedFiles];
    setStagedFiles([]);
    setValue("");
    adjustHeight(true);

    if (filesToUpload.length === 0) return;

    setIsUploading(true);
    setUploadStatus(
      `Processing ${filesToUpload.length} file${filesToUpload.length === 1 ? "" : "s"}...`
    );

    try {
      const results = await Promise.all(
        filesToUpload.map(async (file) => {
          const formData = new FormData();
          formData.append("file", file);
          const response = await fetch("/api/upload", {
            method: "POST",
            body: formData,
          });
          const data = (await response.json()) as {
            error?: string;
            filename?: string;
            chars?: number;
            learning_event?: { title?: string };
            concepts?: string[];
            checklist?: string[];
            interactive_story?: { title?: string; opening?: string };
            final_storytelling?: string;
            story_beats?: Array<{
              label: string;
              narrative: string;
              is_decision: boolean;
              choices: string[];
              image_steps: Array<{
                step_label: string;
                prompt: string;
                image_data: string;
              }>;
            }>;
            llm_used?: boolean;
            llm_status?: string;
            pipeline_trace?: Array<{ node?: string }>;
          };
          return { file, ok: response.ok, data };
        })
      );

      const failed = results.filter((r) => !r.ok);
      const succeeded = results.filter((r) => r.ok);

      if (failed.length > 0) {
        const failedNames = failed.map((r) => r.file.name).join(", ");
        setUploadStatus(
          succeeded.length > 0
            ? `Processed ${succeeded.length} file(s). Failed: ${failedNames}`
            : `Upload failed: ${failed[0].data.error ?? failedNames}`
        );
      } else {
        const mapped = succeeded.map((r) => ({
          filename: r.data.filename ?? r.file.name,
          storyText: r.data.final_storytelling ?? "",
          llmUsed: Boolean(r.data.llm_used),
          llmStatus: r.data.llm_status ?? "",
          traceNodes: (r.data.pipeline_trace ?? [])
            .map((step) => step.node ?? "")
            .filter((node): node is string => Boolean(node)),
          concepts: r.data.concepts ?? [],
          checklist: r.data.checklist ?? [],
          storyTitle: r.data.interactive_story?.title ?? "LastMinute Mission",
          storyOpening: r.data.interactive_story?.opening ?? "",
          beats: r.data.story_beats ?? [],
        }));
        setLearningOutput(mapped);
        const summary = succeeded
          .map((r) => {
            const base = `${r.data.filename ?? r.file.name} (${r.data.chars ?? 0} chars)`;
            const title = r.data.learning_event?.title;
            return title ? `${base} -> ${title}` : base;
          })
          .join("; ");
        setUploadStatus(
          succeeded.length === 1
            ? `Processed ${summary}.`
            : `Processed ${succeeded.length} files: ${summary}`
        );
      }
    } catch {
      setUploadStatus("Upload failed.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex w-full max-w-4xl flex-col items-center gap-10 px-4 py-16">
      {/* Heading */}
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          LastMinute
        </h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Upload your materials, choose your intensity, start learning.
        </p>
      </div>

      {/* Chat input */}
      <div className="w-full">
        <div className="rounded-xl border border-border bg-background transition-shadow focus-within:border-foreground/20">
          {/* Staged file chips */}
          {stagedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 px-3 pt-3">
              {stagedFiles.map((file, idx) => (
                <span
                  key={`${file.name}-${idx}`}
                  className="flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1 text-xs text-foreground"
                >
                  <FileUp className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="max-w-[160px] truncate">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => removeStaged(idx)}
                    className="ml-0.5 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="overflow-y-auto">
            <Textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                adjustHeight();
              }}
              onKeyDown={handleKeyDown}
              placeholder="What are you studying?"
              className={cn(
                "w-full px-4 py-3",
                "resize-none",
                "bg-transparent",
                "border-none",
                "text-foreground text-sm",
                "focus:outline-none",
                "focus-visible:ring-0 focus-visible:ring-offset-0",
                "placeholder:text-muted-foreground placeholder:text-sm",
                "min-h-[60px]"
              )}
              style={{ overflow: "hidden" }}
            />
          </div>

          <div className="flex items-center justify-between px-3 pb-3">
            <button
              type="button"
              onClick={openFilePicker}
              disabled={isUploading}
              className="group flex items-center gap-1.5 rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              <Paperclip className="h-4 w-4" />
              <span className="hidden text-xs group-hover:inline">Attach</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
              >
                <PlusIcon className="h-3.5 w-3.5" />
                Course
              </button>

              <button
                type="button"
                disabled={isUploading}
                onClick={handleSubmit}
                className={cn(
                  "flex items-center justify-center rounded-md p-1.5 transition-all",
                  value.trim() || stagedFiles.length > 0
                    ? "bg-foreground text-background"
                    : "text-muted-foreground"
                )}
              >
                <ArrowUpIcon className="h-4 w-4" />
                <span className="sr-only">Send</span>
              </button>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.md,.pptx,.png,.jpg,.jpeg"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>

        {/* Action chips */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <ActionButton
            icon={<FileUp className="h-3.5 w-3.5" />}
            label="Upload Syllabus"
            onClick={openFilePicker}
          />
          <ActionButton icon={<BookOpen className="h-3.5 w-3.5" />} label="Study Materials" />
          <ActionButton icon={<Brain className="h-3.5 w-3.5" />} label="Practice Quiz" />
          <ActionButton icon={<Sparkles className="h-3.5 w-3.5" />} label="Start a Mission" href="/workspace" />
        </div>
        {uploadStatus ? (
          <p className="mt-3 text-center text-xs text-muted-foreground">
            {uploadStatus}
          </p>
        ) : null}
        {learningOutput.length > 0 ? (
          <div className="mt-6 space-y-6">
            {learningOutput.map((item) => (
              <div
                key={item.filename}
                className="rounded-2xl border border-border bg-card text-sm text-foreground overflow-hidden"
              >
                <div className="border-b border-border bg-muted/30 px-5 py-3">
                  <p className="text-xs font-medium text-foreground">{item.filename}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {item.llmUsed ? "LLM-generated story" : "Fallback story (LLM unavailable)"}
                  </p>
                  {!item.llmUsed && item.llmStatus ? (
                    <p className="text-[11px] text-muted-foreground">
                      Reason: {item.llmStatus}
                    </p>
                  ) : null}
                  {item.traceNodes.length > 0 ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Trace: {item.traceNodes.join(" -> ")}
                    </p>
                  ) : null}
                </div>

                {item.beats && item.beats.length > 0 ? (
                  <div className="divide-y divide-border">
                    {item.beats.map((beat, bIdx) => (
                      <div key={`${item.filename}-beat-${bIdx}`} className="px-5 py-5">
                        <div className="mb-3 flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-[11px] font-bold text-background">
                            {bIdx + 1}
                          </span>
                          <h3 className="text-sm font-semibold tracking-tight text-foreground">
                            {beat.label}
                          </h3>
                        </div>
                        <p className="mb-4 whitespace-pre-line leading-relaxed text-foreground/90">
                          {beat.narrative}
                        </p>
                        {beat.image_steps && beat.image_steps.some((s) => s.image_data) ? (
                          <div className="mb-2">
                            <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                              <ImageIcon className="h-3.5 w-3.5" />
                              Step-by-step
                            </p>
                            <div className="grid grid-cols-3 gap-4">
                              {beat.image_steps.map((step, sIdx) => (
                                <div
                                  key={`${item.filename}-beat-${bIdx}-step-${sIdx}`}
                                  className="group overflow-hidden rounded-xl border border-border bg-muted/20 transition-shadow hover:shadow-lg"
                                >
                                  {step.image_data ? (
                                    /* eslint-disable-next-line @next/next/no-img-element */
                                    <img
                                      src={step.image_data}
                                      alt={step.step_label || `Step ${sIdx + 1}`}
                                      className="h-52 w-full object-contain bg-muted/30 sm:h-64"
                                    />
                                  ) : (
                                    <div className="flex h-52 w-full items-center justify-center bg-muted text-xs text-muted-foreground sm:h-64">
                                      Generating...
                                    </div>
                                  )}
                                  {step.step_label ? (
                                    <p className="px-3 py-2 text-xs font-medium text-foreground">
                                      {step.step_label}
                                    </p>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {beat.is_decision && beat.choices.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {beat.choices.map((choice, cIdx) => (
                              <button
                                key={`${item.filename}-beat-${bIdx}-choice-${cIdx}`}
                                type="button"
                                className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                              >
                                <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                {choice}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-5 py-4">
                    {item.storyText ? (
                      <p className="whitespace-pre-line leading-relaxed">{item.storyText}</p>
                    ) : (
                      <>
                        <p className="font-medium">{item.storyTitle}</p>
                        {item.storyOpening ? (
                          <p className="mt-1 text-muted-foreground">{item.storyOpening}</p>
                        ) : null}
                      </>
                    )}
                  </div>
                )}

                {(item.concepts.length > 0 || item.checklist.length > 0) ? (
                  <div className="border-t border-border bg-muted/20 px-5 py-3">
                    {item.concepts.length > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Concepts:</span>{" "}
                        {item.concepts.join(", ")}
                      </p>
                    ) : null}
                    {item.checklist.length > 0 ? (
                      <ul className="mt-2 list-disc pl-4 text-xs text-muted-foreground">
                        {item.checklist.slice(0, 4).map((task, idx) => (
                          <li key={`${item.filename}-task-${idx}`}>{task}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Action chip                                                       */
/* ------------------------------------------------------------------ */

interface ActionButtonProps {
  icon: ReactNode;
  label: string;
  href?: string;
  onClick?: () => void;
}

function ActionButton({ icon, label, href, onClick }: ActionButtonProps) {
  const cls =
    "flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground";

  if (href) {
    return (
      <Link href={href} className={cls}>
        {icon}
        {label}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={cls}>
      {icon}
      {label}
    </button>
  );
}
