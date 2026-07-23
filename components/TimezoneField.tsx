"use client";

import { useEffect, useState } from "react";

/**
 * Hidden form field carrying the visitor's real browser timezone — more accurate than
 * inferring it from a "where do you work?" question, and one less thing to ask at signup.
 * Server-side validation in createBusiness falls back to a currency-based default if the
 * value is missing or invalid.
 */
export function TimezoneField() {
  const [tz, setTz] = useState("");
  useEffect(() => {
    try {
      setTz(Intl.DateTimeFormat().resolvedOptions().timeZone ?? "");
    } catch {
      // leave empty — server falls back
    }
  }, []);
  return <input type="hidden" name="tz" value={tz} />;
}
