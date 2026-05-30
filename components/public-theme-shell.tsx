"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type PublicThemeMode = "light" | "dark";

type PublicThemeContextValue = {
  themeMode: PublicThemeMode;
  toggleTheme: () => void;
};

const PublicThemeContext = createContext<PublicThemeContextValue | null>(null);

export function PublicThemeShell({ children }: { children: ReactNode }) {
  const [themeMode, setThemeMode] = useState<PublicThemeMode>("light");

  useEffect(() => {
    const savedTheme = localStorage.getItem("trade-theme");
    if (savedTheme === "light" || savedTheme === "dark") {
      setThemeMode(savedTheme);
      return;
    }
    localStorage.setItem("trade-theme", "light");
    document.documentElement.dataset.theme = "light";
  }, []);

  useEffect(() => {
    localStorage.setItem("trade-theme", themeMode);
    document.documentElement.dataset.theme = themeMode;
  }, [themeMode]);

  const value = useMemo(
    () => ({
      themeMode,
      toggleTheme: () => setThemeMode((current) => current === "light" ? "dark" : "light"),
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
