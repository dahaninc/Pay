import React from "react";

const PLACEHOLDER_BRANDS = [
  { name: "Northwind", style: { fontWeight: 800, fontFamily: "sans-serif", fontSize: 22, letterSpacing: "-0.5px" } },
  { name: "Bellcastle", style: { fontWeight: 700, fontFamily: "sans-serif", fontSize: 17, letterSpacing: "2px" } },
  { name: "ARBOR", style: { fontWeight: 400, fontFamily: "serif", fontSize: 19, letterSpacing: "4px" } },
  { name: "Quorum", style: { fontWeight: 600, fontFamily: "sans-serif", fontSize: 20, letterSpacing: "-0.5px" } },
  { name: "GREYFIELD & CO", style: { fontWeight: 300, fontFamily: "sans-serif", fontSize: 15, letterSpacing: "1.5px" } },
  { name: "Pinehurst", style: { fontWeight: 900, fontFamily: "sans-serif", fontSize: 22, letterSpacing: "-1px", textTransform: "uppercase" as const } },
  { name: "Vantis", style: { fontWeight: 800, fontFamily: "sans-serif", fontSize: 24, fontStyle: "italic" as const, letterSpacing: "-1px" } },
  { name: "STONEWELL", style: { fontWeight: 700, fontFamily: "sans-serif", fontSize: 18, letterSpacing: "2px" } },
];

function BrandRow({ ariaHidden }: { ariaHidden?: boolean }) {
  return (
    <div aria-hidden={ariaHidden} className="ticker-track flex items-center flex-shrink-0">
      {PLACEHOLDER_BRANDS.map((brand, i) => (
        <div key={`${ariaHidden ? "dup" : "orig"}-${i}`} className="ticker-logo-box flex items-center justify-center flex-shrink-0 select-none">
          <span style={{ color: "#111111", ...brand.style }}>{brand.name}</span>
        </div>
      ))}
    </div>
  );
}

// Placeholder-only marquee: invented brand names, no real company logos or names.
// Swap PLACEHOLDER_BRANDS for real customer logos once real consent is obtained —
// see the hard rule on fabricated marketing claims in CLAUDE.md.
export default function CustomersBrandTicker() {
  return (
    <div className="ticker-component-container w-full relative">
      <style>{`
        @keyframes customerLogoScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .ticker-window {
          position: relative;
          width: 100%;
          overflow: hidden;
          background: var(--surface, #ffffff);
          padding: 36px 0;
          border: 1px solid var(--border, #e5e7eb);
          border-radius: 12px;
        }
        .ticker-belt {
          display: flex;
          width: max-content;
        }
        .ticker-track {
          animation: customerLogoScroll 40s linear infinite;
        }
        .ticker-logo-box {
          width: 200px;
          height: 56px;
          margin: 0 32px;
        }
        .ticker-window:hover .ticker-track {
          animation-play-state: paused;
        }
      `}</style>

      <div className="ticker-window">
        <p className="text-xs font-semibold uppercase tracking-widest text-center mb-6" style={{ color: "var(--muted, #9ca3af)" }}>
          Placeholder brands — swap for real customer logos once consent is obtained
        </p>
        <div className="ticker-belt">
          <BrandRow />
          <BrandRow ariaHidden />
        </div>
      </div>
    </div>
  );
}
