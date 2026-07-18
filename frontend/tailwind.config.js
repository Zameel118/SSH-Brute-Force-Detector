/** @type {import('tailwindcss').Config} */
/**
 * Signal-Ops Console design tokens.
 * Phosphor amber for live signal; steel for neutral data; sharp panels.
 */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0B0D10",
          panel: "#14171C",
          edge: "#1E2329",
          line: "#2A3038",
        },
        phosphor: {
          DEFAULT: "#FFB300",
          dim: "#C48A00",
          glow: "rgba(255, 179, 0, 0.15)",
        },
        steel: {
          DEFAULT: "#5B7C99",
          muted: "#3D556B",
        },
        signal: {
          ok: "#6B9E78",
          alert: "#F5A623",
          danger: "#E5484D",
        },
        chalk: {
          DEFAULT: "#C8CDD4",
          muted: "#6E7681",
          faint: "#4A5058",
        },
        // Back-compat aliases used while components are migrated
        surface: {
          DEFAULT: "#0B0D10",
          raised: "#14171C",
          border: "#2A3038",
        },
        accent: {
          green: "#6B9E78",
          yellow: "#F5A623",
          orange: "#F5A623",
          red: "#E5484D",
          cyan: "#FFB300",
        },
      },
      fontFamily: {
        sans: ['"Space Grotesk"', "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.06em" }],
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
        panel: "inset 0 1px 0 rgba(255,255,255,0.04), inset 0 -1px 0 rgba(0,0,0,0.35)",
        inset: "inset 0 1px 2px rgba(0,0,0,0.45)",
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
          "40%": { backgroundColor: "rgba(255, 179, 0, 0.08)" },
        },
      },
      animation: {
        "radar-sweep": "radar-sweep 4.5s ease-in-out infinite",
        "row-pulse": "row-pulse 1.2s ease-out 1",
      },
    },
  },
  plugins: [],
};
