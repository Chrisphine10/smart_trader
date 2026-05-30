"use client";

import Link from "next/link";
import { Moon, Sun } from "lucide-react";
import { Logo } from "./logo";
import { usePublicTheme } from "./public-theme-shell";

export function PublicNav() {
  const { themeMode, toggleTheme } = usePublicTheme();

  return (
    <nav className="sticky top-0 z-40 border-b border-white/10 bg-ink/85 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
        <Logo />
        <div className="hidden items-center gap-1 md:flex">
          <a href="/#markets" className="rounded-md px-3 py-1.5 text-[13px] text-gray-400 hover:bg-white/5 hover:text-white">Markets</a>
          <a href="/#features" className="rounded-md px-3 py-1.5 text-[13px] text-gray-400 hover:bg-white/5 hover:text-white">AI Platform</a>
          <a href="/#system" className="rounded-md px-3 py-1.5 text-[13px] text-gray-400 hover:bg-white/5 hover:text-white">Architecture</a>
          <Link href="/terms-and-conditions" className="rounded-md px-3 py-1.5 text-[13px] text-gray-400 hover:bg-white/5 hover:text-white">Terms</Link>
        </div>
        <div className="flex items-center gap-2">
          <button
            aria-label={`Switch to ${themeMode === "light" ? "dark" : "light"} theme`}
            title={`Switch to ${themeMode === "light" ? "dark" : "light"} theme`}
            onClick={toggleTheme}
            className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white"
          >
            {themeMode === "light" ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          <Link href="/login" className="rounded-md px-3.5 py-1.5 text-[13px] font-medium text-gray-300 hover:text-white">Log in</Link>
          <Link href="/register" className="rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold shadow-glow">Start Trading</Link>
        </div>
      </div>
    </nav>
  );
}
