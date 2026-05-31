"use client";

import Link from "next/link";
import { LandingAuthActions } from "./landing-auth-actions";
import { Logo } from "./logo";
import { PublicThemeToggle } from "./public-theme-toggle";

export function PublicNav() {
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
          <PublicThemeToggle />
          <LandingAuthActions variant="nav" />
        </div>
      </div>
    </nav>
  );
}
