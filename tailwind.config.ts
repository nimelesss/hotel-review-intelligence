import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        bgElevated: "var(--bg-elevated)",
        panel: "var(--panel)",
        panelSolid: "var(--panel-solid)",
        panelMuted: "var(--panel-muted)",
        panelStrong: "var(--panel-strong)",
        border: "var(--border)",
        borderStrong: "var(--border-strong)",
        text: "var(--text)",
        textMuted: "var(--text-muted)",
        textSoft: "var(--text-soft)",
        accent: "var(--accent)",
        accentStrong: "var(--accent-strong)",
        accentSoft: "var(--accent-soft)",
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)",
        info: "var(--info)"
      },
      boxShadow: {
        panel: "0 20px 70px rgba(8, 20, 35, 0.12)",
        soft: "0 10px 34px rgba(8, 20, 35, 0.08)",
        glow: "0 12px 40px rgba(15, 108, 130, 0.18)",
        insetSoft: "inset 0 1px 0 rgba(255, 255, 255, 0.38)"
      },
      borderRadius: {
        xl2: "1.25rem",
        "2xl2": "1.75rem"
      }
    }
  },
  plugins: []
};

export default config;
