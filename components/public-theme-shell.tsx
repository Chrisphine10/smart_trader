"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type PublicThemeMode = "light" | "dark";

type PublicThemeContextValue = {
  themeMode: PublicThemeMode;
  toggleTheme: () => void;
};

const PublicThemeContext = createContext<PublicThemeContextValue | null>(null);

function isPublicThemeMode(value: unknown): value is PublicThemeMode {
  return value === "light" || value === "dark";
}

export function PublicThemeShell({ children }: { children: ReactNode }) {
  const [themeMode, setThemeMode] = useState<PublicThemeMode>("light");

  useEffect(() => {
    const savedTheme = localStorage.getItem("trade-theme");
    const nextTheme = isPublicThemeMode(savedTheme) ? savedTheme : "light";
    setThemeMode(nextTheme);
    localStorage.setItem("trade-theme", nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }, []);

  useEffect(() => {
    localStorage.setItem("trade-theme", themeMode);
    document.documentElement.dataset.theme = themeMode;
    document.querySelectorAll<HTMLElement>(".trade-theme").forEach((element) => {
      element.dataset.theme = themeMode;
    });
  }, [themeMode]);

  useEffect(() => {
    const handleThemeChange = (event: Event) => {
      const nextTheme = (event as CustomEvent<PublicThemeMode>).detail;
      if (isPublicThemeMode(nextTheme)) setThemeMode(nextTheme);
    };
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === "trade-theme" && isPublicThemeMode(event.newValue)) {
        setThemeMode(event.newValue);
      }
    };

    window.addEventListener("trade-theme-change", handleThemeChange);
    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener("trade-theme-change", handleThemeChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  const value = useMemo(
    () => ({
      themeMode,
      toggleTheme: () => setThemeMode((current) => {
        const nextTheme = current === "light" ? "dark" : "light";
        window.dispatchEvent(new CustomEvent<PublicThemeMode>("trade-theme-change", { detail: nextTheme }));
        return nextTheme;
      }),
    }),
    [themeMode],
  );

  return (
    <PublicThemeContext.Provider value={value}>
      <main className="trade-theme min-h-screen overflow-x-hidden bg-ink text-white" data-theme={themeMode}>
        {children}
      </main>
    </PublicThemeContext.Provider>
  );
}

export function usePublicTheme() {
  const context = useContext(PublicThemeContext);
  if (!context) throw new Error("usePublicTheme must be used inside PublicThemeShell");
  return context;
}
