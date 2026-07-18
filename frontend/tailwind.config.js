/** @type {import('tailwindcss').Config} */
/**
 * Colors resolve from CSS variables so dark/light themes stay in sync.
 */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "var(--ink)",
          panel: "var(--panel)",
          edge: "var(--panel-edge)",
          line: "var(--hairline)",
        },
        phosphor: {
          DEFAULT: "var(--phosphor)",
          dim: "var(--phosphor-dim)",
          on: "var(--on-phosphor)",
          glow: "var(--phosphor-glow)",
        },
        steel: {
          DEFAULT: "var(--steel)",
          muted: "var(--steel-muted)",
        },
        signal: {
          ok: "var(--ok)",
          alert: "var(--alert)",
          danger: "var(--danger)",
        },
        chalk: {
          DEFAULT: "var(--text)",
          muted: "var(--muted)",
          faint: "var(--faint)",
        },
        surface: {
          DEFAULT: "var(--ink)",
          raised: "var(--panel)",
          border: "var(--hairline)",
        },
        accent: {
          green: "var(--ok)",
          yellow: "var(--alert)",
          orange: "var(--alert)",
          red: "var(--danger)",
          cyan: "var(--phosphor)",
        },
      },
      fontFamily: {
        sans: ['"Space Grotesk"', "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.06em" }],
      },
      maxWidth: {
        console: "100%",
        "console-pad": "1920px",
      },
      borderRadius: {
        none: "0",
        sm: "2px",
        DEFAULT: "2px",
        md: "2px",
        lg: "2px",
        xl: "2px",
        "2xl": "2px",
      },
      boxShadow: {
        panel: "var(--panel-shadow)",
        inset: "inset 0 1px 2px rgba(0,0,0,0.12)",
        none: "none",
      },
      keyframes: {
        "radar-sweep": {
          "0%": { transform: "translateX(-100%)", opacity: "0" },
          "8%": { opacity: "0.85" },
          "92%": { opacity: "0.85" },
          "100%": { transform: "translateX(100%)", opacity: "0" },
        },
        "row-pulse": {
          "0%, 100%": { backgroundColor: "transparent" },
          "40%": { backgroundColor: "var(--phosphor-glow)" },
        },
        "signal-pulse": {
          "0%, 100%": { opacity: "0.55" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        "radar-sweep": "radar-sweep 4.5s ease-in-out infinite",
        "row-pulse": "row-pulse 1.2s ease-out 1",
        "signal-pulse": "signal-pulse 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
