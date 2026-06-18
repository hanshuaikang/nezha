import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { Search, ChevronDown, RotateCcw, Check, X } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import type React from "react";
import type { FontFamily } from "../../types";
import { useI18n } from "../../i18n";
import s from "../../styles";
import { loadSystemFonts, parseFirstFontName, filterFonts, quoteFontName } from "../../utils/fonts";

const FONT_ITEM_HEIGHT = 32;
const FONT_LIST_HEIGHT = 280;
const FONT_LIST_OVERSCAN = 6;

interface FontSelectorProps {
  value: FontFamily;
  onChange: (value: FontFamily) => void;
  label: string;
  hint: string;
  defaultFont: FontFamily;
  preview?: React.ReactNode;
}

export function FontSelector({ value, onChange, label, hint, defaultFont, preview }: FontSelectorProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [fonts, setFonts] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [scrollTop, setScrollTop] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => filterFonts(fonts, search), [fonts, search]);
  const visibleStart = Math.max(0, Math.floor(scrollTop / FONT_ITEM_HEIGHT) - FONT_LIST_OVERSCAN);
  const visibleEnd = Math.min(
    filtered.length,
    visibleStart + Math.ceil(FONT_LIST_HEIGHT / FONT_ITEM_HEIGHT) + FONT_LIST_OVERSCAN * 2,
  );
  const visibleFonts = filtered.slice(visibleStart, visibleEnd);
  const listHeight = Math.min(FONT_LIST_HEIGHT, filtered.length * FONT_ITEM_HEIGHT);

  useEffect(() => {
    if (!open) return;
    if (loaded) return;
    let cancelled = false;
    loadSystemFonts().then((result) => {
      if (cancelled) return;
      setFonts(result);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [open, loaded]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    setFocusedIndex(-1);
    setScrollTop(0);
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [search]);

  useEffect(() => {
    if (!open || !loaded) return;
    const target = parseFirstFontName(value).toLowerCase();
    const idx = filtered.findIndex((f) => f.toLowerCase() === target);
    if (idx >= 0) {
      setFocusedIndex(idx);
      requestAnimationFrame(() => scrollItemIntoView(idx));
    }
  }, [open, loaded, value, filtered]);

  const displayName = parseFirstFontName(value);

  const handleSelect = useCallback(
    (font: string) => {
      onChange(quoteFontName(font));
      setOpen(false);
      setSearch("");
    },
    [onChange],
  );

  function scrollItemIntoView(index: number) {
    const list = listRef.current;
    if (!list) return;
    const itemTop = index * FONT_ITEM_HEIGHT;
    const itemBottom = itemTop + FONT_ITEM_HEIGHT;
    if (itemTop < list.scrollTop) {
      list.scrollTop = itemTop;
      return;
    }
    if (itemBottom > list.scrollTop + FONT_LIST_HEIGHT) {
      list.scrollTop = itemBottom - FONT_LIST_HEIGHT;
    }
  }

  const isSelected = useCallback(
    (font: string) => parseFirstFontName(value).toLowerCase() === font.toLowerCase(),
    [value],
  );

  return (
    <div style={s.fontSection}>
      <div style={s.fontSelectorInner}>
        <div style={s.fontSelectorLabelSection}>
          <div style={s.fontSelectorLabelRow}>
            <span style={s.fontSettingLabel}>
              {label}
            </span>
            <button
              type="button"
              onClick={() => onChange(defaultFont)}
              style={{
                ...s.fontSelectorResetBtn,
                visibility: value !== defaultFont ? "visible" : "hidden",
              }}
            >
              <RotateCcw size={11} />
              {t("common.reset")}
            </button>
          </div>
          <span style={s.fontSettingHint}>
            {hint}
          </span>
        </div>

        <Popover.Root open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(""); }}>
          <Popover.Trigger asChild>
            <button
              type="button"
              className="radix-select-trigger"
              style={s.fontSelectorTrigger}
            >
              <span
                style={{ ...s.fontSelectorTriggerContent, fontFamily: value }}
              >
                {displayName || t("fontSelector.notAvailable")}
              </span>
              <ChevronDown size={13} strokeWidth={2} color="var(--text-hint)" style={{ flexShrink: 0 }} />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              className="font-selector-content"
              sideOffset={4}
              align="start"
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <div className="font-selector-search">
                <Search size={13} strokeWidth={2} color="var(--text-hint)" />
                <input
                  ref={inputRef}
                  className="font-selector-search-input"
                  placeholder={t("fontSelector.search")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button type="button" className="font-selector-clear" onClick={() => setSearch("")}>
                    <X size={11} />
                  </button>
                )}
              </div>
              <div
                ref={listRef}
                className="font-selector-list"
                role="listbox"
                aria-label={label}
                onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
                style={filtered.length > 0 ? { height: listHeight } : undefined}
              >
                {!loaded && (
                  <div className="font-selector-empty">{t("fontSelector.loading")}</div>
                )}
                {loaded && filtered.length === 0 && !search && (
                  <div className="font-selector-empty">{t("fontSelector.notAvailable")}</div>
                )}
                {loaded && search && filtered.length === 0 && (
                  <div className="font-selector-empty">{t("fontSelector.noResults")}</div>
                )}
                {filtered.length > 0 && (
                  <div className="font-selector-virtual-spacer" style={{ height: filtered.length * FONT_ITEM_HEIGHT }}>
                    {visibleFonts.map((font, offset) => {
                      const index = visibleStart + offset;
                      const selected = isSelected(font);
                      return (
                        <button
                          key={font}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          className="font-selector-item"
                          tabIndex={-1}
                          style={{
                            top: index * FONT_ITEM_HEIGHT,
                            height: FONT_ITEM_HEIGHT,
                            fontFamily: selected ? font : undefined,
                            background: focusedIndex === index
                              ? "var(--bg-hover)"
                              : selected
                                ? "var(--control-active-bg)"
                                : undefined,
                          }}
                          onClick={() => handleSelect(font)}
                          onMouseEnter={() => setFocusedIndex(index)}
                        >
                          <span className="font-selector-item-name">{font}</span>
                          {selected && (
                            <Check size={12} strokeWidth={2.5} color="var(--accent)" style={{ flexShrink: 0 }} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        {preview}
      </div>
    </div>
  );
}
