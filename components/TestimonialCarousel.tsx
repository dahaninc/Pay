"use client";

import { useState } from "react";

export interface Testimonial {
  quote: string;
  name: string;
  role: string;
  initials: string;
}

/**
 * The homepage prototype's testimonial carousel (card + arrows + dots), faithful to the
 * approved design. Renders NOTHING when the list is empty — the section only appears once
 * real, consented customer quotes exist (see TESTIMONIALS in app/page.tsx). Never populate
 * this with invented quotes or real-company attributions that aren't actual customers.
 */
export function TestimonialCarousel({ testimonials }: { testimonials: Testimonial[] }) {
  const [idx, setIdx] = useState(0);
  if (testimonials.length === 0) return null;
  const t = testimonials[idx % testimonials.length];
  const n = testimonials.length;

  return (
    <section id="trust" className="max-w-[960px] mx-auto px-6 py-[88px]">
      <p className="text-[13px] font-bold tracking-[0.06em] uppercase text-accent-text m-0 text-center">
        Customers
      </p>
      <h2 className="font-disp font-extrabold text-[clamp(26px,3.6vw,38px)] text-ink text-center mt-3">
        Better service. Hours saved. One place to manage it all.
      </h2>
      <div className="relative max-w-[720px] mx-auto mt-11">
        <div className="border border-hair rounded-[20px] px-12 py-11 bg-surface min-h-[230px] flex flex-col justify-center">
          <p
            key={idx}
            className="anim-fade font-disp text-[clamp(18px,2.4vw,23px)] leading-normal font-semibold text-ink m-0 text-center"
          >
            &ldquo;{t.quote}&rdquo;
          </p>
          <div key={`b${idx}`} className="anim-fade flex items-center justify-center gap-3 mt-[26px]">
            <span className="w-[42px] h-[42px] rounded-full bg-surface2 grid place-items-center font-bold text-[13px] text-accent-text shrink-0">
              {t.initials}
            </span>
            <div className="text-left">
              <p className="font-bold m-0 text-sm text-ink">{t.name}</p>
              <p className="text-muted m-0 text-[12.5px] font-medium">{t.role}</p>
            </div>
          </div>
        </div>
        {n > 1 && (
          <>
            <button
              aria-label="Previous"
              onClick={() => setIdx((i) => (i + n - 1) % n)}
              className="hidden sm:grid place-items-center absolute -left-[52px] top-1/2 -translate-y-1/2 w-[38px] h-[38px] rounded-full border border-hair bg-surface text-base text-muted cursor-pointer"
            >
              ←
            </button>
            <button
              aria-label="Next"
              onClick={() => setIdx((i) => (i + 1) % n)}
              className="hidden sm:grid place-items-center absolute -right-[52px] top-1/2 -translate-y-1/2 w-[38px] h-[38px] rounded-full border border-hair bg-surface text-base text-muted cursor-pointer"
            >
              →
            </button>
            <div className="flex justify-center gap-2 mt-[22px]">
              {testimonials.map((_, i) => (
                <button
                  key={i}
                  aria-label={`Go to testimonial ${i + 1}`}
                  onClick={() => setIdx(i)}
                  className="h-2 rounded-full p-0 transition-all cursor-pointer"
                  style={{
                    width: i === idx ? 22 : 8,
                    background: i === idx ? "var(--accent)" : "var(--hair)",
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
