import Image from "next/image";
import { BRAND } from "@/lib/brand";

/**
 * Brand mark + wordmark. Two pre-rendered variants of the SAME official line art
 * (see scripts note in CLAUDE.md): navy ink for light mode, the art's original
 * slate stroke for dark mode — swapped purely via CSS (`.logo-light`/`.logo-dark`
 * in globals.css) so the server-rendered markup is theme-agnostic.
 */
export function Logo({ size = 34, withWordmark = true }: { size?: number; withWordmark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Image
        src="/logo-mark.png"
        alt={`${BRAND} logo`}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className="logo-light"
        priority
      />
      <Image
        src="/logo-mark-dark.png"
        alt={`${BRAND} logo`}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className="logo-dark"
        priority
      />
      {withWordmark && (
        <span className="font-disp font-extrabold text-xl tracking-[-0.02em] text-ink">{BRAND}</span>
      )}
    </span>
  );
}
