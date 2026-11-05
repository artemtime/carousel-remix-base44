import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { slideReady } from "@/lib/readiness";
import { slideOptions } from "@/lib/slide-options";
import { renderSlide, downloadCanvas } from "@/lib/slide-renderer";
import { fetchImageData } from "@/lib/server-fns";
import { cn } from "@/lib/utils";

// Превью слайда: всё рисуется на Canvas, буквы — код, не нейросеть.
export default function SlideCanvas({ slide, profile, aspect, className, width = 420, showDownload = false, downloadName }) {
  const canvasRef = useRef(null);
  const proxy = useServerFn(fetchImageData);
  const [rendering, setRendering] = useState(true);
  const [error, setError] = useState("");

  const imageUrl = slide?.image_url;
  const imageUrl2 = slide?.image_url_2;
  const text = slide?.text;
  const layout = slide?.layout;
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setRendering(true);
    setError("");
    const buffer=document.createElement("canvas");
    renderSlide(buffer, slideOptions(slide || {}, { profile, aspect,
      proxy: (url) => proxy({ data: { url } }) }))
      .then(()=>{
        if(cancelled || !canvasRef.current)return;
        const target=canvasRef.current;target.width=buffer.width;target.height=buffer.height;
        target.getContext("2d").drawImage(buffer,0,0);
      })
      .catch((e) => !cancelled && setError(String(e.message || e)))
      .finally(() => !cancelled && setRendering(false));
    return () => {
      cancelled = true;
    };
  }, [imageUrl, imageUrl2, text, layout, aspect, profile?.font, profile?.weight, profile?.size, profile?.uppercase, profile?.placement, contentKey(profile), contentKey(slide?.reference_card), tick]);

  return (
    <div className={cn("group relative", className)}>
      <div className="relative overflow-hidden rounded-xl border border-border/70 bg-[hsl(var(--muted))]">
        <canvas ref={canvasRef} className="block h-auto w-full" style={{ maxWidth: width }} />
        {rendering && (
          <div className="absolute inset-0 grid place-items-center bg-background/40 backdrop-blur-[1px]">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && <div className="absolute inset-x-0 bottom-0 bg-destructive/90 px-2 py-1 text-[11px] text-white">{error}</div>}
        {showDownload && !rendering && !error && slideReady(slide) && (
          <button
            onClick={async () => {
              try {
                await renderSlide(canvasRef.current, slideOptions(slide, { profile, aspect, strict: true, proxy: (url) => proxy({ data: { url } }) }));
                await downloadCanvas(canvasRef.current, downloadName || "slide.png");
              } catch (e) { setError(String(e.message || e)); }
            }}
            className="absolute right-2 top-2 rounded-md bg-black/55 p-1.5 text-white opacity-0 backdrop-blur transition-opacity hover:bg-black/75 group-hover:opacity-100"
            title="Скачать PNG"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {showDownload && (
        <button
          onClick={() => setTick((t) => t + 1)}
          className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className="h-3 w-3" /> обновить превью
        </button>
      )}
    </div>
  );
}

function contentKey(profile) {
  return JSON.stringify(profile || {});
}
