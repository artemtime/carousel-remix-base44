import { useState } from "react";
import { Maximize2 } from "lucide-react";
import { Image } from "@/components/ui/image";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

// Миниатюра референса без обрезки: по нажатию открывается крупно, пропорции сохраняются.
export default function ReferencePreview({ url, index, brief }) {
  const [open, setOpen] = useState(false);
  if (!url) return null;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/40 p-2">
      <button type="button" onClick={() => setOpen(true)} className="group relative block w-20 shrink-0" title="Открыть крупно">
        <Image src={url} alt={`референс ${index}`} className="h-24 w-20 rounded-md bg-background" fittingType="fit" />
        <span className="absolute bottom-1 right-1 rounded bg-background/80 p-1 text-foreground">
          <Maximize2 className="h-3 w-3" />
        </span>
      </button>
      <div className="min-w-0 py-1">
        <p className="text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">референс · карточка {index}</p>
        {brief && <p className="mt-1 line-clamp-2 text-[10.5px] leading-snug text-muted-foreground">{brief}</p>}
        <button type="button" onClick={() => setOpen(true)} className="mt-1 text-[10.5px] text-muted-foreground hover:text-foreground">Открыть крупно</button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[min(94vw,780px)] border-border/70 bg-[hsl(var(--card))] p-2">
          <DialogTitle className="sr-only">Референс · карточка {index}</DialogTitle>
          <Image
            src={url}
            alt={`референс ${index}`}
            className="max-h-[84vh] w-full rounded-md bg-[hsl(var(--background))]"
            fittingType="fit"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}