"use client";

import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Classic meme caption compositor: top/bottom bold white text with a black
 * outline, rendered on a <canvas> over the generated reaction image. Text is
 * added client-side rather than asked of the image model, which reliably
 * produces crisp, correctly-spelled, easily-edited captions — image models
 * are still unreliable at rendering small legible text.
 */
export function MemeCaptionTool({ imageUrl, fileNamePrefix }: { imageUrl: string; fileNamePrefix: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [topText, setTopText] = useState("");
  const [bottomText, setBottomText] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous"; // required: signed Storage URLs are cross-origin; without this the canvas is tainted and download fails
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      draw(ctx, img, canvas.width, canvas.height, topText, bottomText);
      setReady(true);
    };
    img.src = imageUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !ready) return;
    const img = new Image();
    img.crossOrigin = "anonymous"; // required: signed Storage URLs are cross-origin; without this the canvas is tainted and download fails
    img.onload = () => draw(ctx, img, canvas.width, canvas.height, topText, bottomText);
    img.src = imageUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topText, bottomText, ready]);

  const [downloadError, setDownloadError] = useState<string | null>(null);

  function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const a = document.createElement("a");
      a.download = `${fileNamePrefix.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-meme.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
      setDownloadError(null);
    } catch {
      setDownloadError("Couldn't export the captioned meme. Try right-clicking the preview and choosing Save image.");
    }
  }

  return (
    <div className="space-y-2 border-t border-white/10 pt-3">
      <p className="text-xs font-medium uppercase tracking-wide text-lf-text-faint">Add a caption</p>
      <canvas ref={canvasRef} className="w-full rounded-md" />
      <input value={topText} onChange={(e) => setTopText(e.target.value.toUpperCase())} maxLength={60} placeholder="TOP TEXT"
        className="w-full rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5 text-sm placeholder:text-lf-text-faint focus:border-lf-purple-light focus:outline-none" />
      <input value={bottomText} onChange={(e) => setBottomText(e.target.value.toUpperCase())} maxLength={60} placeholder="BOTTOM TEXT"
        className="w-full rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5 text-sm placeholder:text-lf-text-faint focus:border-lf-purple-light focus:outline-none" />
      <Button variant="secondary" onClick={download} disabled={!ready}>
        <Download size={14} /> Download meme
      </Button>
      {downloadError && <p className="text-xs text-red-400">{downloadError}</p>}
    </div>
  );
}

function draw(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number, top: string, bottom: string) {
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const fontSize = Math.round(w * 0.09);
  ctx.font = `900 ${fontSize}px Impact, "Arial Black", sans-serif`;
  ctx.textAlign = "center";
  ctx.lineWidth = Math.max(2, fontSize * 0.08);
  ctx.strokeStyle = "black";
  ctx.fillStyle = "white";

  const margin = fontSize * 0.15;
  if (top) {
    ctx.textBaseline = "top";
    wrapAndDraw(ctx, top, w / 2, margin, w * 0.92, fontSize);
  }
  if (bottom) {
    ctx.textBaseline = "bottom";
    wrapAndDrawBottom(ctx, bottom, w / 2, h - margin, w * 0.92, fontSize);
  }
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function wrapAndDraw(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  wrapLines(ctx, text, maxWidth).forEach((line, i) => {
    ctx.strokeText(line, x, y + i * lineHeight * 1.05);
    ctx.fillText(line, x, y + i * lineHeight * 1.05);
  });
}

function wrapAndDrawBottom(ctx: CanvasRenderingContext2D, text: string, x: number, yBottom: number, maxWidth: number, lineHeight: number) {
  const lines = wrapLines(ctx, text, maxWidth);
  lines.forEach((line, i) => {
    const y = yBottom - (lines.length - 1 - i) * lineHeight * 1.05;
    ctx.strokeText(line, x, y);
    ctx.fillText(line, x, y);
  });
}
