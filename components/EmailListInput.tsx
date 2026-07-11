"use client";

import { useState } from "react";
import { PlusIcon } from "@/components/icons";

const MAX_EMAILS = 5;

/**
 * Primary email + up to 4 extra recipients ("+" to add, per design request).
 * Submits as customer_email (first) and repeated extra_email fields.
 */
export function EmailListInput({
  defaultPrimary = "",
  defaultExtras = [],
  highlight = false,
}: {
  defaultPrimary?: string;
  defaultExtras?: string[];
  highlight?: boolean;
}) {
  const [extras, setExtras] = useState<string[]>(defaultExtras);

  const total = 1 + extras.length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          name="customer_email"
          type="email"
          className={`field ${highlight ? "!border-amber-ink !bg-amber-soft" : ""}`}
          placeholder="sarah@email.com"
          defaultValue={defaultPrimary}
        />
        {total < MAX_EMAILS && (
          <button
            type="button"
            aria-label="Add another email"
            title="Add another email (reminders go to all of them)"
            onClick={() => setExtras((x) => [...x, ""])}
            className="shrink-0 w-12 h-12 rounded-xl border border-hair bg-surface text-muted hover:bg-surface2 hover:text-ink flex items-center justify-center cursor-pointer transition-colors"
          >
            <PlusIcon size={18} />
          </button>
        )}
      </div>
      {extras.map((value, i) => (
        <div key={i} className="flex gap-2">
          <input
            name="extra_email"
            type="email"
            className="field"
            placeholder={`Extra recipient ${i + 2} of ${MAX_EMAILS}`}
            defaultValue={value}
          />
          <button
            type="button"
            aria-label="Remove this email"
            onClick={() => setExtras((x) => x.filter((_, j) => j !== i))}
            className="shrink-0 w-12 h-12 rounded-xl border border-hair bg-surface text-muted hover:bg-danger-soft hover:text-danger-ink flex items-center justify-center cursor-pointer transition-colors text-lg"
          >
            ×
          </button>
        </div>
      ))}
      {extras.length > 0 && (
        <p className="text-[11.5px] font-medium text-muted">
          Reminders go to every address ({total}/{MAX_EMAILS}).
        </p>
      )}
    </div>
  );
}
