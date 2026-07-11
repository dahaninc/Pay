"use client";

import { useEffect, useState } from "react";

export function ThemeToggle({ withLabel = false }: { withLabel?: boolean }) {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    setDark(document.documentElement.getAttribute("data-theme") === "dark");
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
    document.cookie = `theme=${next ? "dark" : "light"};path=/;max-age=31536000;samesite=lax`;
  }

  const track = (
    <span
      className={`relative inline-block w-11 h-[26px] rounded-full transition-colors ${
        dark ? "bg-accent" : "bg-surface2 border border-hair"
      }`}
    >
      <span
        className={`absolute top-[3px] w-5 h-5 rounded-full transition-all ${
          dark ? "left-[21px] bg-accent-ink" : "left-[3px] bg-surface shadow-sm"
        }`}
      />
    </span>
  );

  if (!withLabel)
    return (
      <button onClick={toggle} aria-label="Toggle dark mode" className="cursor-pointer">
        {track}
      </button>
    );

  return (
    <button
      onClick={toggle}
      className="flex w-full items-center justify-between rounded-xl border border-hair px-3.5 py-2.5 text-[12.5px] font-semibold text-ink cursor-pointer hover:bg-surface2 transition-colors"
    >
      <span>Dark mode</span>
      {track}
    </button>
  );
}
