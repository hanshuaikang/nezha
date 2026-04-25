import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { ChevronDown, ChevronRight, FileCode } from "lucide-react";
import s from "../../styles";
import type { DiffFile, DiffHunk, DiffRow, DiffViewMode } from "./types";
import { fileDir, fileName, lineMarker, rowTone, statusStyle } from "./parse";

const UNIFIED_GRID: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "56px 56px 24px minmax(0, 1fr)",
  minHeight: 22,
  fontFamily: "var(--font-mono)",
  fontSize: 12.5,
  lineHeight: "22px",
};

const SPLIT_CELL_GRID: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "48px 22px minmax(0, 1fr)",
  minHeight: 22,
  fontFamily: "var(--font-mono)",
  fontSize: 12.5,
  lineHeight: "22px",
};

const SPLIT_PAIR_GRID: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 1px minmax(0, 1fr)",
};

function UnifiedRow({ row }: { row: DiffRow }) {
  const tone = rowTone(row.type);
  return (
    <div style={{ ...UNIFIED_GRID, background: tone.bg }}>
      <span style={s.diffLineNumber}>{row.oldLine ?? ""}</span>
      <span style={s.diffLineNumber}>{row.newLine ?? ""}</span>
      <span style={{ ...s.diffLineMarker, color: tone.fg, background: tone.markerBg }}>
        {lineMarker(row.type)}
      </span>
      <span style={{ ...s.diffLineContent, color: tone.fg }}>{row.content || " "}</span>
    </div>
  );
}

function SplitCell({ row, side }: { row?: DiffRow; side: "old" | "new" }) {
  if (!row) {
    return (
      <div style={{ ...SPLIT_CELL_GRID, ...s.diffSplitEmpty }}>
        <span style={s.diffLineNumber} />
        <span />
        <span />
      </div>
    );
  }
  const tone = rowTone(row.type);
  const lineNumber = side === "old" ? row.oldLine : row.newLine;
  return (
    <div style={{ ...SPLIT_CELL_GRID, background: tone.bg }}>
      <span style={s.diffLineNumber}>{lineNumber ?? ""}</span>
      <span style={{ ...s.diffLineMarker, color: tone.fg, background: tone.markerBg }}>
        {lineMarker(row.type)}
      </span>
      <span style={{ ...s.diffLineContent, color: tone.fg }}>{row.content || " "}</span>
    </div>
  );
}

function SplitPair({ children }: { children: ReactNode }) {
  return (
    <div style={SPLIT_PAIR_GRID}>
      {children}
    </div>
  );
}

const SPLIT_DIVIDER = (
  <div style={{ background: "var(--border-dim)" }} aria-hidden />
);

function SplitRows({ rows }: { rows: DiffRow[] }) {
  const rendered: ReactNode[] = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];

    if (row.type === "remove") {
      const removed: DiffRow[] = [];
      const added: DiffRow[] = [];
      while (rows[index]?.type === "remove") {
        removed.push(rows[index]);
        index += 1;
      }
      while (rows[index]?.type === "add") {
        added.push(rows[index]);
        index += 1;
      }
      index -= 1;
      const pairCount = Math.max(removed.length, added.length);
      for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
        rendered.push(
          <SplitPair key={`pair-${index}-${pairIndex}`}>
            <SplitCell row={removed[pairIndex]} side="old" />
            {SPLIT_DIVIDER}
            <SplitCell row={added[pairIndex]} side="new" />
          </SplitPair>,
        );
      }
      continue;
    }

    if (row.type === "add") {
      rendered.push(
        <SplitPair key={`add-${index}`}>
          <SplitCell side="old" />
          {SPLIT_DIVIDER}
          <SplitCell row={row} side="new" />
        </SplitPair>,
      );
      continue;
    }

    if (row.type === "meta") {
      rendered.push(
        <div key={`meta-${index}`} style={s.diffMetaRow}>
          {row.content}
        </div>,
      );
      continue;
    }

    rendered.push(
      <SplitPair key={`context-${index}`}>
        <SplitCell row={row} side="old" />
        {SPLIT_DIVIDER}
        <SplitCell row={row} side="new" />
      </SplitPair>,
    );
  }

  return <>{rendered}</>;
}

function HunkHeader({ header, split }: { header: string; split: boolean }) {
  return (
    <div
      style={{
        ...s.diffHunkHeader,
        ...(split
          ? {}
          : {
              display: "grid",
              gridTemplateColumns: "56px 56px 24px minmax(0, 1fr)",
            }),
      }}
    >
      {split ? (
        <span style={s.diffHunkHeaderText}>{header}</span>
      ) : (
        <>
          <span />
          <span />
          <span />
          <span style={s.diffHunkHeaderText}>{header}</span>
        </>
      )}
    </div>
  );
}

// 单个 hunk 的懒渲染容器：默认不渲染内容（只占一个 placeholder 高度），
// 进入视口时再挂载真实 DOM；一旦渲染就保持挂载，避免滚动时反复卸载触发闪烁。
function LazyHunkBody({
  rows,
  split,
  initiallyVisible,
}: {
  rows: DiffRow[];
  split: boolean;
  initiallyVisible: boolean;
}) {
  const [visible, setVisible] = useState(initiallyVisible);
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (visible) return;
    const el = hostRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  // 为避免占位高度与实际高度差距过大引起滚动抖动，用行数 × 22px 作为最小高度。
  const placeholderHeight = Math.max(rows.length * 22, 22);

  return (
    <div ref={hostRef} style={{ minHeight: visible ? 0 : placeholderHeight }}>
      {visible ? (
        split ? (
          <SplitRows rows={rows} />
        ) : (
          rows.map((row, rowIndex) => <UnifiedRow key={rowIndex} row={row} />)
        )
      ) : (
        <div style={s.diffLazyPlaceholder}>…</div>
      )}
    </div>
  );
}

function DiffHunkView({
  hunk,
  split,
  initiallyVisible,
}: {
  hunk: DiffHunk;
  split: boolean;
  initiallyVisible: boolean;
}) {
  return (
    <div>
      <HunkHeader header={hunk.header} split={split} />
      <LazyHunkBody rows={hunk.rows} split={split} initiallyVisible={initiallyVisible} />
    </div>
  );
}

export function DiffFileBlock({ file, viewMode }: { file: DiffFile; viewMode: DiffViewMode }) {
  const dir = fileDir(file.displayPath);
  const name = fileName(file.displayPath);
  const isSplit = viewMode === "split";
  const status = statusStyle(file.status);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div style={s.diffFileBlock}>
      <button
        type="button"
        style={s.diffFileHeader}
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expand file" : "Collapse file"}
      >
        {collapsed ? (
          <ChevronRight size={14} color="var(--text-hint)" />
        ) : (
          <ChevronDown size={14} color="var(--text-hint)" />
        )}
        <FileCode size={14} color="var(--text-muted)" />
        <span style={s.diffFileName}>{name}</span>
        {dir && <span style={s.diffFileDir}>{dir}/</span>}
        {file.status === "renamed" && file.renameFrom && (
          <span style={{ ...s.diffFileDir, fontStyle: "italic" as const }}>
            ← {file.renameFrom}
          </span>
        )}
        <span style={{ flex: 1 }} />
        {!file.isBinary && (
          <>
            <span style={{ fontSize: 12, ...s.diffAddCount }}>+{file.additions}</span>
            <span style={{ fontSize: 12, ...s.diffDeleteCount }}>-{file.deletions}</span>
          </>
        )}
        <span style={{ ...s.diffStatusBadge, color: status.fg, background: status.bg }}>
          {status.label}
        </span>
      </button>

      {!collapsed && (
        <div style={s.diffFileBody}>
          {file.isBinary ? (
            <div style={s.diffFileEmpty}>Binary file not shown</div>
          ) : file.hunks.length === 0 ? (
            <div style={s.diffFileEmpty}>
              {file.headerLines.length > 0 ? file.headerLines.join("\n") : "No textual changes"}
            </div>
          ) : (
            file.hunks.map((hunk, index) => (
              <DiffHunkView
                key={`${hunk.header}-${index}`}
                hunk={hunk}
                split={isSplit}
                initiallyVisible={index < 2}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
