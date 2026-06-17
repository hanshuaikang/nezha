import * as Select from "@radix-ui/react-select";
import { invoke } from "@tauri-apps/api/core";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import s from "../../styles";
import { useI18n } from "../../i18n";
import { FileIcon } from "./FileIcon";
import type { ProjectFileSearchResult } from "./types";

const SEARCH_DEBOUNCE_MS = 200;
const SEARCH_LIMIT = 80;

interface FileFilter {
  id: string;
  label?: string;
  labelKey?: string;
  extensions: string[];
}

const FILE_FILTERS: FileFilter[] = [
  { id: "all", labelKey: "file.searchAllTypes", extensions: [] },
  { id: "ts", label: "TS", extensions: ["ts", "tsx"] },
  { id: "js", label: "JS", extensions: ["js", "jsx", "mjs", "cjs"] },
  { id: "rust", label: "Rust", extensions: ["rs"] },
  { id: "py", label: "Python", extensions: ["py"] },
  { id: "go", label: "Go", extensions: ["go"] },
  { id: "web", label: "Web", extensions: ["html", "css", "scss"] },
  { id: "json", label: "JSON", extensions: ["json", "jsonc"] },
  { id: "yaml", label: "YAML", extensions: ["yml", "yaml"] },
  { id: "md", label: "Markdown", extensions: ["md", "mdx"] },
  { id: "config", labelKey: "file.searchConfigTypes", extensions: ["toml", "ini", "env"] },
  {
    id: "image",
    labelKey: "file.searchImageTypes",
    extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"],
  },
];

function filterLabel(filter: FileFilter, t: ReturnType<typeof useI18n>["t"]) {
  return filter.labelKey ? t(filter.labelKey) : (filter.label ?? filter.id);
}

export function FileSearchDialog({
  projectPath,
  onFileSelect,
  onClose,
}: {
  projectPath: string;
  onFileSelect: (path: string, name: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [filterId, setFilterId] = useState("all");
  const [results, setResults] = useState<ProjectFileSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [hoveredFilterId, setHoveredFilterId] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const activeFilter = useMemo(
    () => FILE_FILTERS.find((filter) => filter.id === filterId) ?? FILE_FILTERS[0],
    [filterId],
  );
  const queryText = query.trim();
  const searchActive = queryText.length > 0 || activeFilter.extensions.length > 0;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;

    if (!searchActive) {
      setResults([]);
      setLoading(false);
      setError(null);
      setActiveIndex(0);
      return;
    }

    setLoading(true);
    setResults([]);
    setActiveIndex(0);
    setError(null);
    const timer = window.setTimeout(() => {
      invoke<ProjectFileSearchResult[]>("search_project_files", {
        projectPath,
        query: queryText,
        extensions: activeFilter.extensions,
        limit: SEARCH_LIMIT,
      })
        .then((nextResults) => {
          if (requestId !== requestIdRef.current) return;
          setResults(nextResults);
          setActiveIndex(0);
        })
        .catch((err: unknown) => {
          if (requestId !== requestIdRef.current) return;
          setResults([]);
          setError(String(err));
        })
        .finally(() => {
          if (requestId === requestIdRef.current) {
            setLoading(false);
          }
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [activeFilter.extensions, projectPath, queryText, searchActive]);

  const clearSearch = () => {
    setQuery("");
    setFilterId("all");
  };

  const openResult = (result: ProjectFileSearchResult) => {
    onFileSelect(result.path, result.name);
    onClose();
  };

  return (
    <div style={s.fileSearchDialogBackdrop} onMouseDown={onClose}>
      <div
        style={s.fileSearchDialog}
        data-shortcut-scope="ignore"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div style={s.fileSearchDialogHeader}>
          <span style={s.fileSearchDialogTitle}>{t("toolbar.search")}</span>
          <button
            type="button"
            title={t("common.close")}
            aria-label={t("common.close")}
            onClick={onClose}
            style={s.fileSearchClearBtn}
          >
            <X size={12} />
          </button>
        </div>
        <div style={s.fileSearchBox}>
          <Search size={13} style={s.fileSearchIcon} />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                onClose();
                event.preventDefault();
                return;
              }
              if (loading || !searchActive || results.length === 0) return;
              if (event.key === "ArrowDown") {
                setActiveIndex((idx) => Math.min(results.length - 1, idx + 1));
                event.preventDefault();
              } else if (event.key === "ArrowUp") {
                setActiveIndex((idx) => Math.max(0, idx - 1));
                event.preventDefault();
              } else if (event.key === "Enter") {
                openResult(results[activeIndex]);
                event.preventDefault();
              }
            }}
            placeholder={t("file.searchPlaceholder")}
            style={s.fileSearchInput}
          />
          {(query || activeFilter.extensions.length > 0) && (
            <button
              type="button"
              title={t("common.clear")}
              aria-label={t("common.clear")}
              onClick={clearSearch}
              style={s.fileSearchClearBtn}
            >
              <X size={12} />
            </button>
          )}
          <Select.Root value={filterId} onValueChange={setFilterId}>
            <Select.Trigger aria-label={t("file.searchTypeFilter")} style={s.fileSearchTypeTrigger}>
              <Select.Value>{filterLabel(activeFilter, t)}</Select.Value>
              <Select.Icon asChild>
                <ChevronDown size={12} />
              </Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Content position="popper" sideOffset={4} style={s.fileSearchTypeContent}>
                <Select.Viewport style={s.settingsSelectViewport}>
                {FILE_FILTERS.map((filter) => {
                  const selected = filter.id === filterId;
                  const highlighted = selected || filter.id === hoveredFilterId;
                  return (
                    <Select.Item
                      key={filter.id}
                      value={filter.id}
                      onMouseEnter={() => setHoveredFilterId(filter.id)}
                      onMouseLeave={() => setHoveredFilterId(null)}
                      onFocus={() => setHoveredFilterId(filter.id)}
                      onBlur={() => setHoveredFilterId(null)}
                      style={{
                        ...s.fileSearchTypeItem,
                        ...(highlighted ? s.fileSearchTypeItemSelected : null),
                      }}
                    >
                        <Select.ItemText>{filterLabel(filter, t)}</Select.ItemText>
                        <Select.ItemIndicator style={s.settingsSelectIndicator}>
                          <Check size={12} />
                        </Select.ItemIndicator>
                      </Select.Item>
                    );
                  })}
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>
        </div>

        <div style={s.fileSearchResults}>
          {!searchActive ? (
            <div style={s.fileSearchEmpty}>{t("file.searchStartTyping")}</div>
          ) : loading ? (
            <div style={s.fileSearchEmpty}>{t("common.loading")}</div>
          ) : error ? (
            <div style={s.fileSearchEmpty}>{t("file.searchFailed", { error })}</div>
          ) : results.length === 0 ? (
            <div style={s.fileSearchEmpty}>{t("file.searchNoResults")}</div>
          ) : (
            results.map((result, index) => {
              const highlighted = activeIndex === index;
              return (
                <button
                  key={result.path}
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => openResult(result)}
                  style={{
                    ...s.fileSearchResult,
                    ...(highlighted ? s.fileSearchResultActive : null),
                  }}
                >
                  <FileIcon
                    name={result.name}
                    ext={result.extension}
                    isDir={false}
                    isGitignored={false}
                  />
                  <span style={s.fileSearchResultMain}>
                    <span style={s.fileSearchResultName}>{result.name}</span>
                    {result.dir && <span style={s.fileSearchResultDir}>{result.dir}</span>}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
