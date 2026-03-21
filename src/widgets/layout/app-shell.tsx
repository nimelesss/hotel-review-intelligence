import Link from "next/link";
import { APP_NAME } from "@/shared/config/constants";

const NAV_LINKS = [
  { href: "/", label: "Сводка" },
  { href: "/reviews", label: "Отзывы" },
  { href: "/segments", label: "Сегменты" },
  { href: "/recommendations", label: "Рекомендации" },
  { href: "/upload", label: "Загрузка данных" },
  { href: "/methodology", label: "Методика" }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="anim-glow-drift absolute -left-20 top-24 h-72 w-72 rounded-full bg-cyan-200/35 blur-3xl" />
        <div className="anim-glow-drift absolute -right-20 bottom-12 h-80 w-80 rounded-full bg-blue-200/30 blur-3xl" />
      </div>
      <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-4 p-4 lg:grid-cols-[260px_1fr]">
        <aside className="anim-fade-up rounded-xl2 border border-border bg-panel p-4 shadow-panel lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]">
          <div className="mb-6 border-b border-border pb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-textMuted">
              B2B SaaS
            </p>
            <h2 className="mt-2 text-lg font-bold text-text">{APP_NAME}</h2>
            <p className="mt-2 text-xs text-textMuted">
              Аналитика отзывов для управления гостиницей
            </p>
          </div>
          <nav className="space-y-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="nav-link block rounded-lg px-3 py-2 text-sm font-medium text-text transition-colors hover:bg-panelMuted"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="mt-6 rounded-lg border border-border bg-panelMuted p-3 text-xs text-textMuted">
            Версия MVP: приоритет на управленческие решения по реальным отзывам.
          </div>
        </aside>
        <main className="pb-8">{children}</main>
      </div>
    </div>
  );
}
