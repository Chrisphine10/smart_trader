import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#13161e",
        panel: "#1a1d27",
        lift: "#222639",
        brand: "#FACC15",
        mint: "#F59E0B",
      },
      boxShadow: {
        glow: "0 18px 60px rgba(250, 204, 21, 0.25)",
      },
    },
  },
  plugins: [],
};

export default config;
