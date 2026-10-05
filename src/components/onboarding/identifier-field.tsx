"use client";

import { DEFAULT_COUNTRY, findCountry } from "@/core/auth/identifier";
import CountryPicker from "./country-picker";

export type IdentifierMode = "email" | "phone";

/**
 * The "email address or phone number" control, shared by sign-up and sign-in so
 * the two can never drift apart on which value a form actually submits.
 *
 * The country `<select>` is only rendered in phone mode, because a dial code is
 * meaningless for an email address. The dial code is a non-editable prefix: it
 * comes from the selected country, so the submitted number is always the full
 * international form and the server never has to guess what `+` meant.
 */
export default function IdentifierField({
  mode,
  onModeChange,
  identifier,
  onIdentifierChange,
  countryCode,
  onCountryCodeChange,
  idPrefix,
  inputCls,
  labelCls,
  autoComplete = "email",
  required = true,
}: {
  mode: IdentifierMode;
  onModeChange: (mode: IdentifierMode) => void;
  identifier: string;
  onIdentifierChange: (value: string) => void;
  countryCode: string;
  onCountryCodeChange: (code: string) => void;
  /** Distinct ids per form so a sign-in page with two fields cannot collide. */
  idPrefix: string;
  inputCls: string;
  labelCls: string;
  autoComplete?: string;
  required?: boolean;
}) {
  const selected = findCountry(countryCode) ?? findCountry(DEFAULT_COUNTRY)!;

  const tabCls = (active: boolean) =>
    `flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors duration-200 ${
      active ? "bg-primary/20 text-primary" : "text-white/40 hover:text-white/60"
    }`;

  return (
    <div>
      <span className={labelCls}>البريد الإلكتروني أو رقم الجوال</span>

      {/* Mode switch */}
      <div
        role="tablist"
        aria-label="طريقة تسجيل الدخول"
        className="mb-2 flex gap-1 rounded-xl border border-white/[0.08] bg-white/[0.02] p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "email"}
          onClick={() => onModeChange("email")}
          className={tabCls(mode === "email")}
        >
          بريد إلكتروني
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "phone"}
          onClick={() => onModeChange("phone")}
          className={tabCls(mode === "phone")}
        >
          رقم الجوال
        </button>
      </div>

      {mode === "email" ? (
        <input
          id={`${idPrefix}-identifier`}
          type="email"
          required={required}
          autoComplete={autoComplete}
          value={identifier}
          onChange={(e) => onIdentifierChange(e.target.value)}
          placeholder="you@example.com"
          className={inputCls}
          dir="ltr"
        />
      ) : (
        <div className="flex gap-2" dir="ltr">
          <CountryPicker value={selected.code} onChange={onCountryCodeChange} id={`${idPrefix}-country`} />
          <input
            id={`${idPrefix}-identifier`}
            type="tel"
            required={required}
            inputMode="tel"
            autoComplete="tel-national"
            value={identifier}
            onChange={(e) => onIdentifierChange(e.target.value)}
            placeholder={selected.code === "YE" ? "777777777" : "123456789"}
            className={`${inputCls} flex-1`}
            dir="ltr"
          />
        </div>
      )}
    </div>
  );
}
