// Библиотека героев: выбрать героя можно без смены стиля.
import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { cn } from "@/lib/utils";

export default function HeroPicker({ value, onChange, className, defaultName }) {
  const [heroes, setHeroes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.Hero.list({ sort: "-updated_date", limit: 50 })
      .then((page) => setHeroes(page.items || []))
      .catch(() => setHeroes([]))
      .finally(() => setLoading(false));
  }, []);

  const selected = heroes.find((h) => h.id === value) || null;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2">
        <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <select
          value={value || ""}
          onChange={(e) => {
            const hero = heroes.find((h) => h.id === e.target.value) || null;
            onChange(hero ? hero.id : "", hero);
          }}
          className="h-8 min-w-0 flex-1 rounded-md border border-border bg-[hsl(var(--input))]/40 px-2 text-[11.5px] outline-none focus:border-[hsl(var(--primary))]/50"
        >
          <option value="">{defaultName ? `герой из стиля: ${defaultName}` : "герой из стиля"}</option>
          {heroes.map((hero) => (
            <option key={hero.id} value={hero.id}>
              {hero.name}
            </option>
          ))}
        </select>
      </div>

      {(selected?.identity_reference_url || selected?.sheet_url) && (
        <div className="overflow-hidden rounded-lg border border-border/70 bg-[hsl(var(--muted))]">
          <Image src={selected.identity_reference_url || selected.sheet_url} alt={selected.name} fittingType="fit" className="h-[92px] w-full" />
        </div>
      )}

      {!loading && heroes.length === 0 && (
        <p className="text-[11px] leading-snug text-muted-foreground">Библиотека пуста: сохраните героя в стиле или на этой странице.</p>
      )}
    </div>
  );
}
