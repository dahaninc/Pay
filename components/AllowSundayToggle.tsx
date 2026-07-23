"use client";

import { useState, useTransition } from "react";
import { updateBusiness } from "@/app/actions/business";

export function AllowSundayToggle({ initialValue }: { initialValue: boolean }) {
  const [allowSunday, setAllowSunday] = useState(initialValue);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !allowSunday;
    setAllowSunday(next);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("allow_sunday", String(next));
      await updateBusiness(fd);
    });
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      className="cursor-pointer"
      aria-label="Allow Sunday sends"
    >
      <span
        className={`relative inline-block w-11 h-[26px] rounded-full transition-colors ${
          allowSunday ? "bg-accent" : "bg-surface2 border border-hair"
        }`}
      >
        <span
          className={`absolute top-[3px] w-5 h-5 rounded-full transition-all ${
            allowSunday ? "left-[21px] bg-accent-ink" : "left-[3px] bg-surface shadow-sm"
          }`}
        />
      </span>
    </button>
  );
}
