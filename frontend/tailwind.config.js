/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        void: {
          DEFAULT: "#05060f",
          soft: "#0a0c1c",
          panel: "#10132a",
        },
        navy: {
          900: "#0a0c1c",
          800: "#11142b",
          700: "#1a1e3d",
        },
        electric: {
          DEFAULT: "#4d8dff",
          light: "#7db2ff",
          glow: "#5ad1ff",
        },
        cyan: {
          glow: "#22d3ee",
        },
        violet: {
          DEFAULT: "#8b5cf6",
          soft: "#b69cff",
        },
        ink: {
          100: "#eef1ff",
          200: "#d3d9f2",
          300: "#b3bbdc",
          400: "#98a1c8",
          500: "#8a93bb",
          600: "#6f78a0",
          700: "#555d84",
        },
        mint: "#4ee8c0",
        amber: "#fbc26d",
        coral: "#ff7f98",
      },
      fontFamily: {
        display: ["'Space Grotesk'", "'Inter'", "system-ui", "sans-serif"],
        body: ["'Inter'", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      backgroundImage: {
        aurora:
          "radial-gradient(120% 120% at 15% -10%, rgba(77,141,255,0.20) 0%, rgba(5,6,15,0) 55%), radial-gradient(100% 100% at 85% 0%, rgba(139,92,246,0.20) 0%, rgba(5,6,15,0) 50%), radial-gradient(140% 140% at 50% 110%, rgba(34,211,238,0.10) 0%, rgba(5,6,15,0) 60%)",
        "glass-sheen": "linear-gradient(135deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.02) 40%, rgba(255,255,255,0) 100%)",
        "neon-gradient": "linear-gradient(135deg, #5aa2ff 0%, #7c8cff 50%, #a47bff 100%)",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(125,178,255,0.20), 0 0 24px rgba(77,141,255,0.30), 0 0 60px rgba(139,92,246,0.14)",
        "glow-violet": "0 0 0 1px rgba(182,156,255,0.22), 0 0 28px rgba(139,92,246,0.32)",
        "glow-cyan": "0 0 0 1px rgba(34,211,238,0.18), 0 0 24px rgba(34,211,238,0.25)",
        card: "0 10px 40px rgba(2,3,12,0.55), inset 0 1px 0 rgba(255,255,255,0.06)",
      },
      borderRadius: {
        xl2: "1.25rem",
        "3xl": "1.75rem",
      },
      keyframes: {
        floaty: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-6px)" } },
        pulseGlow: { "0%,100%": { opacity: 1 }, "50%": { opacity: 0.55 } },
        shimmer: { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
        popIn: { "0%": { opacity: 0, transform: "translateY(8px) scale(0.97)" }, "100%": { opacity: 1, transform: "none" } },
        riseIn: { "0%": { opacity: 0, transform: "translateY(14px)" }, "100%": { opacity: 1, transform: "none" } },
      },
      animation: {
        floaty: "floaty 4s ease-in-out infinite",
        pulseGlow: "pulseGlow 2.2s ease-in-out infinite",
        shimmer: "shimmer 2.5s linear infinite",
        riseIn: "riseIn 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) both",
      },
    },
  },
  plugins: [],
}
