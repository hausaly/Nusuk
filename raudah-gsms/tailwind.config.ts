import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1rem", screens: { "2xl": "1400px" } },
    extend: {
      colors: {
        // Raudah brand scales (600 = brand colour)
        raudah: {
          50: "#F0F0F7", 100: "#DCDDEC", 200: "#BEBEDB", 300: "#9B9CC8", 400: "#7172B1",
          500: "#5657A3", 600: "#3F4096", 700: "#34347B", 800: "#27285D", 900: "#1A1B3F",
        },
        brandred: {
          50: "#FDEFEF", 100: "#FBDBDC", 200: "#F7BABC", 300: "#F39699", 400: "#EE6A6E",
          500: "#EB4D53", 600: "#E8353B", 700: "#BE2B30", 800: "#902125", 900: "#611619",
        },
        // Semantic tokens (switch with dark mode via CSS variables)
        background: v("background"),
        surface: v("surface"),
        "surface-2": v("surface-2"),
        border: v("border"),
        foreground: v("foreground"),
        muted: v("muted"),
        primary: { DEFAULT: v("primary"), foreground: v("primary-foreground"), hover: v("primary-hover") },
        accent: { DEFAULT: v("accent"), foreground: v("accent-foreground") },
        ring: v("ring"),
        // Status colours – deliberately NOT the brand red
        success: v("success"),
        danger: v("danger"),
        warning: v("warning"),
        info: v("primary"),
      },
      fontFamily: {
        heading: ["Marcellus", "Georgia", "serif"],
        sans: ["Inter Variable", "Inter", "system-ui", "sans-serif"],
      },
      borderRadius: { xl: "0.875rem", "2xl": "1.25rem" },
      boxShadow: {
        soft: "0 1px 2px rgb(31 33 51 / 0.04), 0 4px 16px rgb(31 33 51 / 0.06)",
      },
    },
  },
  plugins: [animate],
};
export default config;
