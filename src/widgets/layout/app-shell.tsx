"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_NAME, UI_TEXT } from "@/shared/config/constants";
import { cn } from "@/shared/lib/cn";
import { ThemeModeSwitcher } from "@/widgets/layout/theme-mode-switcher";

const NAV_LINKS = [
  { href: "/", label: "Сводка", description: "Управленческая сводка" },
  { href: "/reviews", label: "Отзывы", description: "Корпус отзывов и объяснимость" },
  { href: "/segments", label: "Сегменты", description: "Аудитория и сценарии" },
  { href: "/recommendations", label: "Рекомендации", description: "Приоритеты и действия" },
  { href: "/upload", label: "Загрузка", description: "Импорт и обновление данных" },
  { href: "/methodology", label: "Методика", description: "Правила и ограничения" }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="anim-glow-drift absolute -left-16 top-24 h-72 w-72 rounded-full bg-cyan-200/35 blur-3xl" />
        <div className="anim-glow-drift absolute right-[-4rem] top-[18%] h-80 w-80 rounded-full bg-sky-200/30 blur-3xl" />
        <div className="anim-glow-drift absolute bottom-[-4rem] left-[28%] h-72 w-72 rounded-full bg-amber-200/20 blur-3xl" />
      </div>

      <div className="mx-auto flex min-h-screen w-full max-w-[1680px] flex-col gap-4 px-3 pb-6 pt-3 sm:px-4 lg:grid lg:grid-cols-[310px_minmax(0,1fr)] lg:px-5 lg:pb-8 lg:pt-5">
        <div className="glass-panel surface-ring sticky top-3 z-30 rounded-2xl2 border border-border bg-panel px-4 py-3 shadow-soft lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <Link href="/" className="flex min-w-0 items-center gap-3">
              <BrandMark compact />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-text">{APP_NAME}</p>
                <p className="truncate text-xs text-textMuted">Управленческая аналитика отзывов</p>
              </div>
            </Link>
            <ThemeModeSwitcher compact />
          </div>
          <nav className="mobile-nav-scroll mt-3 flex gap-2 overflow-x-auto pb-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                data-active={isActivePath(pathname, link.href)}
                className={cn(
                  "nav-link shrink-0 rounded-full border px-3 py-2 text-xs font-semibold transition-all duration-200",
                  isActivePath(pathname, link.href)
                    ? "border-accent bg-accentSoft text-text shadow-glow"
                    : "border-border bg-panelSolid text-textMuted hover:border-borderStrong hover:text-text"
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <aside className="hidden lg:block">
          <div className="glass-panel surface-ring sticky top-5 overflow-hidden rounded-[2rem] border border-border bg-panel px-5 py-5 shadow-panel">
            <div className="relative overflow-hidden rounded-[1.5rem] border border-border bg-panelMuted p-5">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent" />
              <div className="flex items-center gap-4">
                <BrandMark />
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-textMuted">Гостиничная SaaS-платформа</p>
                  <h1 className="mt-2 text-[1.75rem] font-semibold leading-none text-text">{APP_NAME}</h1>
                </div>
              </div>
              <p className="mt-4 max-w-[22rem] text-sm leading-6 text-textMuted">{UI_TEXT.productTagline}</p>
            </div>

            <div className="mt-5">
              <ThemeModeSwitcher />
            </div>

            <nav className="mt-6 space-y-2">
              {NAV_LINKS.map((link, index) => {
                const active = isActivePath(pathname, link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    data-active={active}
                    className={cn(
                      "nav-link group block rounded-[1.25rem] border px-4 py-3 transition-all duration-300",
                      active
                        ? "border-accent bg-accentSoft text-text shadow-glow"
                        : "border-border bg-panelSolid text-textMuted hover:-translate-y-0.5 hover:border-borderStrong hover:bg-panelMuted hover:text-text"
                    )}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{link.label}</p>
                        <p className="mt-1 text-xs leading-5 text-textSoft group-data-[active=true]:text-textMuted">
                          {link.description}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "mt-1 h-2.5 w-2.5 rounded-full transition-all duration-200",
                          active ? "bg-accent shadow-glow" : "bg-border"
                        )}
                      />
                    </div>
                  </Link>
                );
              })}
            </nav>

          </div>
        </aside>

        <main className="min-w-0 pb-4 lg:pb-10">{children}</main>
      </div>
    </div>
  );
}

function isActivePath(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={cn(
        "surface-ring brand-orb relative shrink-0 overflow-hidden rounded-[1.25rem] border border-border bg-panelStrong",
        compact ? "h-11 w-11" : "h-16 w-16"
      )}
    >
      <div className="absolute inset-[18%] rounded-[1rem] border border-white/50 bg-white/10" />
      <div className="absolute inset-x-[22%] top-[28%] h-[2px] rounded-full bg-white/85" />
      <div className="absolute inset-x-[22%] top-[44%] h-[2px] rounded-full bg-white/65" />
      <div className="absolute inset-x-[22%] top-[60%] h-[2px] rounded-full bg-white/45" />
      <div className="absolute right-[20%] top-[24%] h-[42%] w-[18%] rounded-full bg-accent" />
      <div className="absolute bottom-[20%] left-[22%] h-[16%] w-[56%] rounded-full bg-white/82" />
    </div>
  );
}
