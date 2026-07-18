"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import Image from "next/image";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type CompactSelectOption = {
  value: string;
  label: string;
  description?: string;
  image?: string;
};

type CompactSelectProps = {
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  options: CompactSelectOption[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  searchable?: boolean;
  className?: string;
};

export function CompactSelect({
  name,
  value,
  defaultValue = "",
  onChange,
  options,
  placeholder = "เลือกรายการ",
  required,
  disabled,
  searchable = false,
  className = "",
}: CompactSelectProps) {
  const listboxId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, maxHeight: 280 });
  const currentValue = value ?? internalValue;
  const selected = options.find((option) => option.value === currentValue);
  const filtered = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("th");
    return keyword
      ? options.filter((option) => `${option.label} ${option.description || ""}`.toLocaleLowerCase("th").includes(keyword))
      : options;
  }, [options, query]);

  function updatePosition() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const roomBelow = window.innerHeight - rect.bottom - 12;
    const maxHeight = Math.max(160, Math.min(320, roomBelow > 190 ? roomBelow : rect.top - 12));
    setPosition({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)),
      top: roomBelow > 190 ? rect.bottom + 6 : Math.max(8, rect.top - maxHeight - 6),
      width: Math.min(rect.width, window.innerWidth - 16),
      maxHeight,
    });
  }

  function choose(nextValue: string) {
    if (value === undefined) setInternalValue(nextValue);
    onChange?.(nextValue);
    setOpen(false);
    setQuery("");
    buttonRef.current?.focus();
  }

  function openMenu() {
    if (disabled) return;
    updatePosition();
    setActiveIndex(Math.max(0, options.findIndex((option) => option.value === currentValue)));
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !(target instanceof Element && target.closest(`[data-select-menu="${CSS.escape(listboxId)}"]`))) setOpen(false);
    };
    const closeOnScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof Element && target.closest(`[data-select-menu="${CSS.escape(listboxId)}"]`)) return;
      setOpen(false);
    };
    const reposition = () => updatePosition();
    document.addEventListener("pointerdown", close);
    window.addEventListener("scroll", closeOnScroll, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", closeOnScroll, true);
      window.removeEventListener("resize", reposition);
    };
  }, [listboxId, open]);

  useEffect(() => {
    if (open && searchable) window.setTimeout(() => searchRef.current?.focus(), 0);
  }, [open, searchable]);

  function handleKeys(event: React.KeyboardEvent) {
    if (!open && ["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      openMenu();
      return;
    }
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((index) => Math.max(0, Math.min(filtered.length - 1, index + direction)));
    } else if (event.key === "Enter" && filtered[activeIndex]) {
      event.preventDefault();
      choose(filtered[activeIndex].value);
    }
  }

  return (
    <>
      {name && <input type="hidden" name={name} value={currentValue} />}
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-required={required}
        disabled={disabled}
        onClick={() => open ? setOpen(false) : openMenu()}
        onKeyDown={handleKeys}
        className={`flex h-11 w-full min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-left text-sm outline-none transition hover:border-blue-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-400 ${className}`}
      >
        {selected?.image && <Image src={selected.image} alt="" width={28} height={28} unoptimized className="size-7 shrink-0 rounded-md bg-slate-50 object-contain" />}
        <span className={`min-w-0 flex-1 truncate ${selected ? "font-semibold text-slate-800" : "text-slate-500"}`}>{selected?.label || placeholder}</span>
        <ChevronDown className={`size-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div
          data-select-menu={listboxId}
          id={listboxId}
          role="listbox"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={handleKeys}
          className="fixed z-[220] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
          style={{ left: position.left, top: position.top, width: position.width }}
        >
          {searchable && (
            <label className="relative block border-b border-slate-100 p-2">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input ref={searchRef} value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }} placeholder="พิมพ์เพื่อค้นหา..." className="h-9 w-full rounded-lg bg-slate-50 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-blue-200" />
            </label>
          )}
          <div className="overflow-y-auto overscroll-contain p-1.5" style={{ maxHeight: position.maxHeight }}>
            {filtered.map((option, index) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === currentValue}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(option.value)}
                className={`flex w-full min-w-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${index === activeIndex ? "bg-blue-50" : "hover:bg-slate-50"}`}
              >
                {option.image ? <Image src={option.image} alt="" width={36} height={36} unoptimized className="size-9 shrink-0 rounded-lg bg-slate-50 object-contain" /> : <span className="size-2 shrink-0 rounded-full bg-blue-300" />}
                <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold text-slate-800">{option.label}</span>{option.description && <span className="block truncate text-[11px] text-slate-500">{option.description}</span>}</span>
                {option.value === currentValue && <Check className="size-4 shrink-0 text-blue-600" />}
              </button>
            ))}
            {!filtered.length && <p className="px-3 py-5 text-center text-xs text-slate-500">ไม่พบรายการ</p>}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
