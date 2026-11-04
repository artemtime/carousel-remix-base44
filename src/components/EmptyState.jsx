export default function EmptyState({ icon: Icon, title, description, children }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-[hsl(var(--card))]/40 px-6 py-14 text-center">
      {Icon && (
        <div className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-[hsl(var(--accent))]">
          <Icon className="h-4.5 w-4.5 text-muted-foreground" />
        </div>
      )}
      <p className="text-[14px] font-medium">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-muted-foreground">{description}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}