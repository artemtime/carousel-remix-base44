export default function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <div className="flex flex-col gap-4 border-b border-border/70 px-5 py-6 md:flex-row md:items-end md:justify-between md:px-8 md:py-8">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-[hsl(var(--primary))]">{eyebrow}</p>}
        <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.02em] md:text-[30px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}