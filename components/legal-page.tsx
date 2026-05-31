import Link from "next/link";
import { Logo } from "./logo";
import { PublicThemeShell } from "./public-theme-shell";
import { PublicThemeToggle } from "./public-theme-toggle";

type LegalSection = {
  title: string;
  body: string[];
};

export function LegalPage({ eyebrow, title, updated, intro, sections }: { eyebrow: string; title: string; updated: string; intro: string; sections: LegalSection[] }) {
  return (
    <PublicThemeShell>
      <div className="min-h-screen bg-ink text-white">
        <header className="border-b border-white/10 bg-panel/80">
          <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
            <Logo />
            <div className="flex items-center gap-2">
              <PublicThemeToggle />
              <Link href="/register" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold shadow-glow">
                Get Started
              </Link>
            </div>
          </div>
        </header>
        <section className="mx-auto max-w-5xl px-5 py-12 md:py-16">
          <div className="mb-8 max-w-3xl">
            <p className="mb-3 text-sm font-semibold text-brand">{eyebrow}</p>
            <h1 className="mb-4 text-4xl font-black tracking-normal md:text-5xl">{title}</h1>
            <p className="mb-3 text-sm text-gray-500">Last updated: {updated}</p>
            <p className="text-base leading-7 text-gray-300">{intro}</p>
          </div>
          <div className="grid gap-4">
            {sections.map((section) => (
              <article key={section.title} className="glass rounded-2xl p-5 md:p-6">
                <h2 className="mb-3 text-xl font-bold">{section.title}</h2>
                <div className="space-y-3 text-sm leading-6 text-gray-300">
                  {section.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </article>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap gap-3 text-sm text-gray-400">
            <Link href="/privacy-policy" className="hover:text-brand">Privacy Policy</Link>
            <Link href="/cookies-policy" className="hover:text-brand">Cookies Policy</Link>
            <Link href="/terms-and-conditions" className="hover:text-brand">Terms and Conditions</Link>
          </div>
        </section>
      </div>
    </PublicThemeShell>
  );
}
