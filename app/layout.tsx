import type { Metadata } from "next";
import { IBM_Plex_Sans, Manrope } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/widgets/layout/app-shell";

const headingFont = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-heading",
  weight: ["500", "600", "700", "800"]
});

const bodyFont = IBM_Plex_Sans({
  subsets: ["latin", "cyrillic"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700"]
});

const THEME_BOOTSTRAP_SCRIPT = `
(() => {
  try {
    const key = "hri-theme-mode";
    const stored = window.localStorage.getItem(key);
    const mode = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
    const resolved = mode === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : mode;

    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themeMode = mode;
  } catch (_) {
    document.documentElement.dataset.theme = "light";
    document.documentElement.dataset.themeMode = "system";
  }
})();
`;

export const metadata: Metadata = {
  title: "Hotel Review Intelligence",
  description:
    "B2B-платформа для управленческой аналитики отзывов в гостиничном бизнесе.",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }]
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className={`${headingFont.variable} ${bodyFont.variable}`}>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
