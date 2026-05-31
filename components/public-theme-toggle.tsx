"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type PublicThemeMode = "light" | "dark";

function isPublicThemeMode(value: unknown): value is PublicThemeMode {
  return value === "light" || value === "dark";
}

function applyTheme(themeMode: PublicThemeMode) {
  localStorage.setItem("trade-theme", themeMode);
  document.documentElement.dataset.theme = themeMode;
  document.querySelectorAll<HTMLElement>(".trade-theme").forEach((element) => {
    element.dataset.theme = themeMode;
  });
}

export function PublicThemeToggle() {
  const [themeMode, setThemeMode] = useState<PublicThemeMode>("light");
  const nextTheme = themeMode === "light" ? "dark" : "light";

  useEffect(() => {
    const savedTheme = localStorage.getItem("trade-theme");
    const initialTheme = isPublicThemeMode(savedTheme) ? savedTheme : "light";
    setThemeMode(initialTheme);
    applyTheme(initialTheme);

    const handleThemeChange = (event: Event) => {
      const changedTheme = (event as CustomEvent<PublicThemeMode>).detail;
      if (isPublicThemeMode(changedTheme)) setThemeMode(changedTheme);
    };

    window.addEventListener("trade-theme-change", handleThemeChange);
    return () => window.removeEventListener("trade-theme-change", handleThemeChange);
  }, []);

  function toggleTheme() {
    setThemeMode(nextTheme);
    applyTheme(nextTheme);
    window.dispatchEvent(new CustomEvent<PublicThemeMode>("trade-theme-change", { detail: nextTheme }));
  }

  return (
    <button
      aria-label={`Switch to ${nextTheme} theme`}
      title={`Switch to ${nextTheme} theme`}
      onClick={toggleTheme}
      className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/5 text-gray-300 transition hover:bg-white/10 hover:text-white"
    >
      {themeMode === "light" ? <Moon size={16} /> : <Sun size={16} />}
    </button>
  );
}
