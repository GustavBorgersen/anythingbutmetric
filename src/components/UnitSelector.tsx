"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { Unit } from "@/lib/types";

interface Props {
  units: Unit[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
}

export default function UnitSelector({
  units,
  value,
  onChange,
  placeholder = "Search units…",
}: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = units.find((u) => u.id === value) ?? null;

  const filtered = query.trim()
    ? units.filter((u) => {
        const q = query.toLowerCase();
        if (u.label.toLowerCase().includes(q)) return true;
        if (u.aliases?.some((a) => a.toLowerCase().includes(q))) return true;
        return false;
      })
    : units;

  const choose = useCallback(
    (unit: Unit) => {
      onChange(unit.id);
      setQuery("");
      setOpen(false);
    },
    [onChange]
  );

  const clear = useCallback(() => {
    onChange(null);
    setQuery("");
    setOpen(false);
    inputRef.current?.focus();
  }, [onChange]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Reset highlight when filtered list changes
  useEffect(() => {
    setHighlighted(0);
  }, [query]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlighted]) choose(filtered[highlighted]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const displayLabel = selected
    ? `${selected.emoji ?? ""} ${selected.label}`.trim()
    : "";

  return (
    <div ref={containerRef} className="relative w-56">
      {/* Trigger / input area */}
      <div
        className="flex items-center gap-1 rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 cursor-text"
        onClick={() => {
          setOpen(true);
          inputRef.current?.focus();
        }}
      >
        {selected && !open ? (
          <>
            <span className="flex-1 truncate">{displayLabel}</span>
            <button
              type="button"
              className="text-zinc-400 hover:text-zinc-100 text-xs leading-none"
              onClick={(e) => {
                e.stopPropagation();
                clear();
              }}
              aria-label="Clear selection"
            >
              ✕
            </button>
          </>
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={query}
            placeholder={selected ? displayLabel : placeholder}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent outline-none placeholder:text-zinc-500 min-w-0"
          />
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <ul className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-zinc-600 bg-zinc-900 py-1 shadow-xl">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-zinc-500 italic">
              No units found
            </li>
          ) : (
            filtered.map((unit, idx) => (
              <li
                key={unit.id}
                className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer ${
                  idx === highlighted
                    ? "bg-zinc-700 text-zinc-100"
                    : "text-zinc-300 hover:bg-zinc-800"
                }`}
                onMouseEnter={() => setHighlighted(idx)}
                onMouseDown={(e) => {
                  e.preventDefault(); // prevent blur
                  choose(unit);
                }}
              >
                {unit.emoji && (
                  <span className="text-base leading-none">{unit.emoji}</span>
                )}
                <span className="truncate">{unit.label}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
