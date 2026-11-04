import { FONTS } from "@/lib/fonts";
import { cn } from "@/lib/utils";

const PLACEMENTS = [
  { id: "overlay", label: "поверх кадра" },
  { id: "band", label: "тёмная полоса" },
  { id: "strip", label: "светлая полоса" },
];

export default function CaptionControls({ profile, onChange }) {
  const p = profile || {};
  const set = (patch) => onChange({ ...p, ...patch });

  return (
    <div className="space-y-4">
      <Field label="Как лежит текст">
        <div className="grid grid-cols-3 gap-1.5">
          {PLACEMENTS.map((item) => (
            <button
              key={item.id}
              onClick={() => set({ placement: item.id })}
              className={cn(
                "rounded-md border px-2 py-1.5 text-[11.5px] transition-colors",
                p.placement === item.id ? "border-[hsl(var(--primary))]/60 bg-[hsl(var(--primary))]/10" : "border-border/70 text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Шрифт">
          <select
            value={p.font || "Montserrat"}
            onChange={(e) => set({ font: e.target.value })}
            className="h-8 w-full rounded-md border border-border bg-[hsl(var(--input))]/40 px-2 text-[12px] outline-none focus:border-[hsl(var(--primary))]/50"
          >
            {FONTS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.key}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Размер">
          <input
            type="range"
            min={36}
            max={120}
            value={Number(p.size) || 64}
            onChange={(e) => set({ size: Number(e.target.value) })}
            className="w-full accent-[hsl(var(--primary))]"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Цвет текста">
          <div className="flex items-center gap-2">
            <input type="color" value={p.color || "#FFFFFF"} onChange={(e) => set({ color: e.target.value })} className="h-8 w-9 cursor-pointer rounded border border-border bg-transparent" />
            <input
              value={p.color || "#FFFFFF"}
              onChange={(e) => set({ color: e.target.value })}
              className="h-8 w-full rounded-md border border-border bg-[hsl(var(--input))]/40 px-2 text-[11.5px] uppercase outline-none"
            />
          </div>
        </Field>
        <Field label="Цвет акцента">
          <div className="flex items-center gap-2">
            <input type="color" value={p.accent || "#F5B342"} onChange={(e) => set({ accent: e.target.value })} className="h-8 w-9 cursor-pointer rounded border border-border bg-transparent" />
            <input
              value={p.accent || "#F5B342"}
              onChange={(e) => set({ accent: e.target.value })}
              className="h-8 w-full rounded-md border border-border bg-[hsl(var(--input))]/40 px-2 text-[11.5px] uppercase outline-none"
            />
          </div>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label={`Ширина букв · ${Math.round((Number(p.squeeze) || 1) * 100)}%`}>
          <input
            type="range"
            min={70}
            max={100}
            value={Math.round((Number(p.squeeze) || 1) * 100)}
            onChange={(e) => set({ squeeze: Number(e.target.value) / 100 })}
            className="w-full accent-[hsl(var(--primary))]"
          />
        </Field>
        <Field label={`Высота текста · ${Math.round((Number(p.position) || 0.8) * 100)}%`}>
          <input
            type="range"
            min={45}
            max={92}
            value={Math.round((Number(p.position) || 0.8) * 100)}
            onChange={(e) => set({ position: Number(e.target.value) / 100 })}
            className="w-full accent-[hsl(var(--primary))]"
          />
        </Field>
      </div>

      <div className="flex flex-wrap gap-2">
        <Toggle active={Boolean(p.uppercase)} onClick={() => set({ uppercase: !p.uppercase })}>
          КАПСОМ
        </Toggle>
        <Toggle active={Boolean(p.shadow)} onClick={() => set({ shadow: !p.shadow })}>
          тень
        </Toggle>
        <Toggle active={Boolean(p.smart_place)} onClick={() => set({ smart_place: !p.smart_place })}>
          уходить с лица
        </Toggle>
        {p.placement === "strip" && (
          <Toggle active={Boolean(p.divider)} onClick={() => set({ divider: !p.divider })}>
            линия
          </Toggle>
        )}
      </div>

      {p.placement === "strip" && (
        <Field label="Цвет полосы">
          <div className="flex items-center gap-2">
            <input type="color" value={p.strip_bg || "#FFFFFF"} onChange={(e) => set({ strip_bg: e.target.value })} className="h-8 w-9 cursor-pointer rounded border border-border bg-transparent" />
            <input
              value={p.strip_bg || "#FFFFFF"}
              onChange={(e) => set({ strip_bg: e.target.value })}
              className="h-8 w-full rounded-md border border-border bg-[hsl(var(--input))]/40 px-2 text-[11.5px] uppercase outline-none"
            />
          </div>
        </Field>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Toggle({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-md border px-2.5 py-1 text-[11px] transition-colors",
        active ? "border-[hsl(var(--primary))]/60 bg-[hsl(var(--primary))]/10 text-foreground" : "border-border/70 text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}