"use client";

import { useCallback, useRef, useState } from "react";
import { UploadCloud, X, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Kept well under hosting platforms' serverless request-body limits (e.g.
// Vercel's 4.5MB cap) once base64-encoded for the API request — see
// /api/generate for the full reasoning.
const MAX_FILE_MB = 3;
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];

interface ImageUploaderProps {
  onImageSelected: (file: File, previewUrl: string) => void;
  onClear: () => void;
  previewUrl: string | null;
  error?: string | null;
}

export function ImageUploader({ onImageSelected, onClear, previewUrl, error }: ImageUploaderProps) {
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateAndUse = useCallback(
    (file: File) => {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setLocalError("Please upload a PNG, JPEG or WebP image.");
        return;
      }
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        setLocalError(`Image must be under ${MAX_FILE_MB}MB.`);
        return;
      }
      setLocalError(null);
      const url = URL.createObjectURL(file);
      onImageSelected(file, url);
    },
    [onImageSelected]
  );

  const shownError = error ?? localError;

  if (previewUrl) {
    return (
      <div className="relative overflow-hidden rounded-xl border border-lf-glass-border">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={previewUrl} alt="Uploaded reference" className="max-h-80 w-full object-contain bg-black/40" />
        <button
          onClick={onClear}
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white backdrop-blur-sm hover:bg-black/80 cursor-pointer"
          aria-label="Remove image"
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) validateAndUse(file);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition-colors",
          dragging ? "border-lf-purple-light bg-lf-purple/10" : "border-white/10 hover:border-white/20"
        )}
      >
        <div className="grid h-12 w-12 place-items-center rounded-full bg-white/5">
          {dragging ? <ImageIcon size={22} /> : <UploadCloud size={22} />}
        </div>
        <div>
          <p className="text-sm font-medium">Drop a photo here, or click to browse</p>
          <p className="mt-1 text-xs text-lf-text-faint">
            PNG, JPEG or WebP, up to {MAX_FILE_MB}MB (large phone photos: try your share sheet&apos;s &ldquo;smaller size&rdquo; option)
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) validateAndUse(file);
          }}
        />
      </div>
      {shownError && <p className="mt-2 text-xs text-red-400">{shownError}</p>}
    </div>
  );
}
