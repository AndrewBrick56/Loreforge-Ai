import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-white/5 py-8 text-sm text-lf-text-faint">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 px-4 sm:flex-row sm:justify-between sm:px-6">
        <p>© {new Date().getFullYear()} LoreForge AI. All characters belong to their creators.</p>
        <div className="flex gap-5">
          <Link href="/explore" className="hover:text-lf-text-dim">Explore</Link>
          <Link href="/create" className="hover:text-lf-text-dim">Create</Link>
          <Link href="/characters" className="hover:text-lf-text-dim">My Characters</Link>
        </div>
      </div>
    </footer>
  );
}
