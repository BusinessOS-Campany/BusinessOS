"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import {
  COUNTRIES_BY_NAME,
  displayDial,
  findCountry,
  flagEmoji,
  searchCountries,
  type Country,
} from "@/core/auth/identifier";

/**
 * Compact country picker.
 *
 * Why this is not a `<select>`: the full dialling-code list is 246 rows, and the
 * trigger is 100px wide. A native select would either need a native dropdown
 * that ignores the dark theme, or a closed state that truncates to
 * "🇾🇪 +96…" — the exact thing that makes a phone field untrustworthy. So the
 * closed state shows only what must always be visible (flag + dialling code) and
 * the panel shows flag + name + code with a search box, which is how every
 * country picker on the web does it once the list passes ~50 entries.
 *
 * Search matches the Arabic name, the ISO code and the dialling code, and
 * ignores a leading "+", so "967", "+967", "YE" and "يمن" all find Yemen.
 */
export default function CountryPicker({
  value,
  onChange,
  id,
  className = "",
  buttonClassName = "",
}: {
  value: string;
  onChange: (code: string) => void;
  id?: string;
  className?: string;
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();

  const selected = findCountry(value) ?? COUNTRIES_BY_NAME[0];

  const results = useMemo(() => searchCountries(query), [query]);

  // Focus is handled by `autoFocus` on the search input (it only exists while
  // the panel is open), and the resets happen in `openPicker` — so these effects
  // only have jobs that genuinely need one: closing on an outside click, and
  // keeping the highlighted row inside the scroll viewport.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function openPicker() {
    setQuery("");
    setActive(Math.max(0, COUNTRIES_BY_NAME.findIndex((c) => c.code === selected.code)));
    setOpen(true);
  }

  function commit(country: Country) {
    onChange(country.code);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        openPicker();
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const picked = results[active];
      if (picked) commit(picked);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`} onKeyDown={onKeyDown}>
      <button
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={`الدولة، الحالية ${selected.nameAr} ${displayDial(selected)}`}
        onClick={() => (open ? setOpen(false) : openPicker())}
        className={`flex w-[100px] shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-2 py-3 text-sm text-white outline-none transition-all duration-300 hover:bg-white/[0.06] focus:border-primary/40 focus:shadow-[0_0_20px_rgba(16,185,129,0.08)] focus:ring-1 focus:ring-primary/20 ${buttonClassName}`}
      >
        <span aria-hidden className="text-base leading-none">
          {flagEmoji(selected.code)}
        </span>
        <span className="font-mono text-xs tabular-nums">{displayDial(selected)}</span>
        <ChevronDown
          aria-hidden
          className={`h-3.5 w-3.5 shrink-0 text-white/30 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          className="absolute top-full z-50 mt-1.5 w-[260px] overflow-hidden rounded-xl border border-white/[0.1] bg-[#0b0b16] shadow-2xl shadow-black/60"
          // The panel is a popup, so keep clicks inside from reaching the form
          // underneath; a stray submit from a 246-row list would be nasty.
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 border-b border-white/[0.07] px-3 py-2">
            <Search aria-hidden className="h-3.5 w-3.5 shrink-0 text-white/30" />
            <input
              ref={searchRef}
              type="text"
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              placeholder="ابحث عن دولة أو رمز"
              aria-label="بحث عن دولة"
              className="w-full bg-transparent text-xs text-white placeholder:text-white/25 outline-none"
            />
          </div>

          {results.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-white/30">لا توجد نتائج</p>
          ) : (
            <ul ref={listRef} id={listboxId} role="listbox" aria-label="الدول" className="max-h-60 overflow-y-auto py-1">
              {results.map((c, i) => {
                const isSelected = c.code === selected.code;
                return (
                  <li key={c.code} role="option" aria-selected={isSelected}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => commit(c)}
                      className={`flex w-full items-center gap-2.5 px-3 py-2 text-right text-xs transition-colors ${
                        i === active ? "bg-primary/15" : ""
                      }`}
                    >
                      <span aria-hidden className="w-5 shrink-0 text-base leading-none">
                        {flagEmoji(c.code)}
                      </span>
                      <span className="flex-1 truncate text-white/85">{c.nameAr}</span>
                      <span className="shrink-0 font-mono text-[10px] tabular-nums text-white/40">
                        {displayDial(c)}
                      </span>
                      {isSelected && <Check aria-hidden className="h-3.5 w-3.5 shrink-0 text-primary" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
