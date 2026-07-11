import { BRAND, BRAND_MARK } from "@/lib/brand";

export function Logo({ size = 34, withWordmark = true }: { size?: number; withWordmark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className="rounded-[11px] bg-accent text-accent-ink font-disp font-extrabold flex items-center justify-center"
        style={{ width: size, height: size, fontSize: size * 0.47 }}
      >
        {BRAND_MARK}
      </span>
      {withWordmark && (
        <span className="font-disp font-extrabold text-xl tracking-[-0.02em] text-ink">{BRAND}</span>
      )}
    </span>
  );
}
