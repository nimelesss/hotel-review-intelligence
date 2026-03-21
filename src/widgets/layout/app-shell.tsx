import Link from "next/link";
import { APP_NAME } from "@/shared/config/constants";

const NAV_LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/reviews", label: "Review Explorer" },
  { href: "/segments", label: "Segment Analysis" },
  { href: "/recommendations", label: "Recommendations" },
  { href: "/upload", label: "Data Upload" },
  { href: "/methodology", label: "Methodology" }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-4 p-4 lg:grid-cols-[260px_1fr]">
        <aside className="rounded-xl2 border border-border bg-panel p-4 shadow-panel lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]">
          <div className="mb-6 border-b border-border pb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-textMuted">
              B2B SaaS
            </p>
            <h2 className="mt-2 text-lg font-bold text-text">{APP_NAME}</h2>
            <p className="mt-2 text-xs text-textMuted">
              Hospitality Review Intelligence Platform
            </p>
          </div>
          <nav className="space-y-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block rounded-lg px-3 py-2 text-sm font-medium text-text transition-colors hover:bg-panelMuted"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="mt-6 rounded-lg border border-border bg-panelMuted p-3 text-xs text-textMuted">
            Product scope: MVP with explainable analytics and readiness for multi-hotel SaaS.
          </div>
        </aside>
        <main className="pb-8">{children}</main>
      </div>
    </div>
  );
}
