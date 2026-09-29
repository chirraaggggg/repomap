import Link from "next/link";

/**
 * RepoTutor brand mark: the same stylized "R" as the favicon, inline SVG so
 * it renders crisply at any size and adapts to the current theme colors.
 */
export function LogoMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden focusable="false">
      <rect width="32" height="32" rx="7" className="fill-[var(--text)]" />
      <path d="M9 8v16" stroke="var(--bg)" strokeWidth="2.6" strokeLinecap="round" />
      <path
        d="M9 9h7a4.5 4.5 0 0 1 0 9H9"
        fill="none"
        stroke="var(--bg)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M15 18l7 6" fill="none" stroke="var(--bg)" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="22" cy="10" r="2.4" className="fill-accent" />
    </svg>
  );
}

/** Navbar/homepage brand: mark + wordmark linking home. */
export function BrandLink({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-mono text-sm font-semibold" aria-label="RepoTutor home">
      <LogoMark className="h-6 w-6" />
      RepoTutor
    </Link>
  );
}
