import Link from "next/link";
import { Logo } from "../components/logo";
import { PublicThemeShell } from "../components/public-theme-shell";
import { PublicThemeToggle } from "../components/public-theme-toggle";

export default function NotFound() {
  return (
    <PublicThemeShell>
      <div className="flex min-h-screen flex-col bg-ink text-white">
        <header className="border-b border-white/10 bg-panel/80">
          <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
            <Logo />
            <PublicThemeToggle />
          </div>
        </header>
        <section className="flex flex-1 items-center justify-center px-5 py-16">
          <div className="max-w-xl text-center">
            <p className="mb-3 text-sm font-bold uppercase tracking-[0.24em] text-brand">404</p>
            <h1 className="mb-4 text-4xl font-black tracking-normal md:text-5xl">Page not found</h1>
            <p className="mx-auto mb-7 max-w-md text-sm leading-6 text-gray-400">
              The page is unavailable or the link has changed.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link href="/" className="rounded-xl bg-brand px-5 py-3 text-sm font-black shadow-glow">Home</Link>
              <Link href="/trade" className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-gray-300 hover:bg-white/10 hover:text-white">Trade</Link>
            </div>
          </div>
        </section>
      </div>
    </PublicThemeShell>
  );
}
