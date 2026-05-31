"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CandlestickChart, CircleUserRound, Landmark } from "lucide-react";

type LandingUser = {
  email?: string;
  username?: string;
  is_demo?: boolean;
};

type AuthState =
  | { status: "checking" }
  | { status: "guest" }
  | { status: "authenticated"; user: LandingUser };

export function LandingAuthActions({ variant = "hero" }: { variant?: "nav" | "hero" | "final" }) {
  const [authState, setAuthState] = useState<AuthState>({ status: "checking" });

  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      const token = localStorage.getItem("token");
      if (!token) {
        setAuthState({ status: "guest" });
        return;
      }

      try {
        const response = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.user) throw new Error("Invalid session");
        if (!cancelled) setAuthState({ status: "authenticated", user: data.user });
      } catch {
        localStorage.removeItem("token");
        if (!cancelled) setAuthState({ status: "guest" });
      }
    }

    loadUser().catch(() => {
      if (!cancelled) setAuthState({ status: "guest" });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (variant === "nav") {
    if (authState.status === "checking") return <div aria-hidden="true" className="h-9 w-36 rounded-lg bg-white/5" />;
    if (authState.status === "authenticated") {
      return (
        <div className="flex items-center gap-2">
          <span className="hidden max-w-32 truncate rounded-md px-2.5 py-1.5 text-[13px] font-medium text-gray-300 sm:inline-flex">
            {authState.user.username || authState.user.email || "Account"}
          </span>
          <Link href="/trade" className="rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold shadow-glow">Dashboard</Link>
        </div>
      );
    }

    return (
      <>
        <Link href="/login" className="rounded-md px-3.5 py-1.5 text-[13px] font-medium text-gray-300 hover:text-white">Log in</Link>
        <Link href="/register" className="rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold shadow-glow">Start Trading</Link>
      </>
    );
  }

  if (authState.status === "checking") {
    const wrapperClass = variant === "final" ? "flex flex-col justify-center gap-3 sm:flex-row" : "mb-9 flex flex-col gap-3 sm:flex-row";
    return (
      <div aria-hidden="true" className={wrapperClass}>
        <div className="h-12 w-44 rounded-xl bg-white/10" />
        <div className="h-12 w-44 rounded-xl bg-white/5" />
      </div>
    );
  }

  if (authState.status === "authenticated") {
    const displayName = authState.user.username || authState.user.email || "Trader";
    if (variant === "final") {
      return (
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/trade" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-8 py-3.5 text-[15px] font-semibold text-brand">
            Open Dashboard <ArrowRight size={16} />
          </Link>
          <Link href="/p2p" className="inline-flex items-center justify-center gap-2 rounded-xl border border-black/10 bg-black/10 px-8 py-3.5 text-[15px] font-semibold text-ink">
            P2P Escrow
          </Link>
        </div>
      );
    }

    return (
      <div className="mb-9">
        <div className="mb-3 inline-flex max-w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-gray-300">
          <CircleUserRound size={16} className="shrink-0 text-brand" />
          <span className="truncate">Signed in as {displayName}</span>
          <span className="shrink-0 text-gray-500">{authState.user.is_demo ? "Demo" : "Real"}</span>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/trade" className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-7 py-3.5 text-[15px] font-semibold shadow-glow">
            Continue Trading <CandlestickChart size={16} />
          </Link>
          <Link href="/p2p" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-7 py-3.5 text-[15px] font-semibold hover:bg-white/5">
            Open P2P Desk <Landmark size={16} />
          </Link>
        </div>
      </div>
    );
  }

  if (variant === "final") {
    return (
      <div className="flex flex-col justify-center gap-3 sm:flex-row">
        <Link href="/register" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-8 py-3.5 text-[15px] font-semibold text-brand">
          Create Account <ArrowRight size={16} />
        </Link>
        <Link href="/trade" className="inline-flex items-center justify-center gap-2 rounded-xl border border-black/10 bg-black/10 px-8 py-3.5 text-[15px] font-semibold text-ink">
          Open AI Workspace
        </Link>
      </div>
    );
  }

  return (
    <div className="mb-9 flex flex-col gap-3 sm:flex-row">
      <Link href="/register" className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-7 py-3.5 text-[15px] font-semibold shadow-glow">
        Create Account <ArrowRight size={16} />
      </Link>
      <Link href="/trade" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-7 py-3.5 text-[15px] font-semibold hover:bg-white/5">
        Open AI Workspace <CandlestickChart size={16} />
      </Link>
    </div>
  );
}
