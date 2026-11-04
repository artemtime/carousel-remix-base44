import { IMAGE_MODELS } from "@/lib/image-models";

export default function ImageModelPicker({ value = "automatic", onChange, disabled = false, label = "Модель рисования" }) {
  const selected = IMAGE_MODELS.find(model => model.id === value);
  return <label className="block space-y-1.5">
    <span className="block text-[11px] text-muted-foreground">{label}</span>
    <select aria-label={label} value={value} onChange={event => onChange(event.target.value)} disabled={disabled}
      className="h-9 w-full rounded-md border border-border bg-[hsl(var(--card))] px-2.5 text-[12px] outline-none disabled:opacity-50">
      {IMAGE_MODELS.map(model => <option key={model.id} value={model.id}>{model.label}</option>)}
    </select>
    <span className="block text-[11px] leading-relaxed text-muted-foreground">{selected?.hint || "Выберите модель из списка."}</span>
  </label>;
}
