import { createFileRoute, Link, Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import { Search, Film, Palette, PenLine, Send, Settings as SettingsIcon, LayoutGrid, LogOut, Bug, BriefcaseBusiness } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import FeedbackButton from "@/components/feedback/FeedbackButton";
import TelegramConnect from "@/components/TelegramConnect";

const NAV = [
  { to: "/", label: "Сегодня", icon: LayoutGrid, exact: true },
  { to: "/editorial", label: "Редакция", icon: BriefcaseBusiness },
  { to: "/scout", label: "Разведчик", icon: Search },
  { to: "/reels", label: "Рилсы", icon: Film },
  { to: "/styles", label: "Мои стили", icon: Palette },
  { to: "/author", label: "Автор", icon: PenLine },
  { to: "/publish", label: "Публикатор", icon: Send },
  { to: "/feedback", label: "Отчёты", icon: Bug },
  { to: "/settings", label: "Настройки", icon: SettingsIcon },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const router = useRouter();

  const isActive = (item) => (item.exact ? path === item.to : path === item.to || path.startsWith(`${item.to}/`));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <aside className="hidden w-[236px] shrink-0 flex-col border-r border-border/70 bg-[hsl(var(--sidebar))] px-4 py-6 md:flex">
          <Link to="/" className="mb-8 flex min-w-0 items-center gap-2.5 px-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[hsl(var(--primary))] text-[15px] font-bold text-[hsl(var(--primary-foreground))]">
              ЦС
            </span>
            <span className="min-w-0 text-[14px] font-semibold leading-tight tracking-tight">Цифровые сотрудники</span>
          </Link>

          <nav className="flex flex-1 flex-col gap-1">
            {NAV.map((item) => {
              const active = isActive(item);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={[
                    "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] transition-colors",
                    active
                      ? "bg-[hsl(var(--accent))] text-foreground"
                      : "text-muted-foreground hover:bg-[hsl(var(--accent))]/60 hover:text-foreground",
                  ].join(" ")}
                >
                  <item.icon className={["h-4 w-4", active ? "text-[hsl(var(--primary))]" : "text-muted-foreground group-hover:text-foreground"].join(" ")} />
                  {item.label}
                </Link>
              );
            })}
            <TelegramConnect />
          </nav>

          <div className="mt-4 border-t border-border/70 pt-4">
            <p className="truncate px-2 text-[12px] text-muted-foreground">{user?.email || "владелец"}</p>
            <button
              onClick={async () => {
                await logout();
                router.navigate({ to: "/login" });
              }}
              className="mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-[hsl(var(--accent))] hover:text-foreground"
            >
              <LogOut className="h-4 w-4" /> Выйти
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border/70 bg-background/85 px-4 py-3 backdrop-blur-xl md:hidden">
            <Link to="/" className="flex items-center gap-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[hsl(var(--primary))] text-[13px] font-bold text-[hsl(var(--primary-foreground))]">
                ЦС
              </span>
              <span className="min-w-0 text-[14px] font-semibold leading-tight">Цифровые сотрудники</span>
            </Link>
          </header>
          <main className="min-w-0 flex-1 pb-24 md:pb-10">{children ?? <Outlet />}</main>
          <FeedbackButton />
          <nav className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t border-border/70 bg-background/95 px-1 py-1.5 backdrop-blur-xl md:hidden">
            {NAV.filter(item=>["/","/scout","/author","/publish","/editorial"].includes(item.to)).map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={[
                  "flex flex-1 flex-col items-center gap-0.5 rounded-md py-1.5 text-[10px]",
                  isActive(item) ? "text-[hsl(var(--primary))]" : "text-muted-foreground",
                ].join(" ")}
              >
                <item.icon className="h-4 w-4" />
                {item.label.split(" ")[0]}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}
