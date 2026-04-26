import type { DiffFile, DiffFileStatus, DiffHunk, DiffLineType } from "./types";

// git 会对含特殊字符的路径输出为带引号的八进制转义形式，如 `"a/\346\265\213\350\257\225.txt"`。
// 这里识别 `"..."` 包裹，再把 \nnn 八进制序列还原成字节，最后按 UTF-8 解码。
function unquoteGitPath(raw: string): string {
  const trimmed = raw.trim();
  if (!(trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2)) {
    return trimmed;
  }
  const inner = trimmed.slice(1, -1);
  const bytes: number[] = [];
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
    if (ch === "\\" && i + 1 < inner.length) {
      const next = inner[i + 1];
      if (next >= "0" && next <= "7" && i + 3 < inner.length) {
        const oct = inner.slice(i + 1, i + 4);
        if (/^[0-7]{3}$/.test(oct)) {
          bytes.push(parseInt(oct, 8));
          i += 3;
          continue;
        }
      }
      const map: Record<string, number> = {
        n: 0x0a,
        t: 0x09,
        r: 0x0d,
        '"': 0x22,
        "\\": 0x5c,
      };
      if (map[next] != null) {
        bytes.push(map[next]);
        i += 1;
        continue;
      }
    }
    const code = ch.charCodeAt(0);
    if (code < 0x80) {
      bytes.push(code);
    } else {
      const encoded = new TextEncoder().encode(ch);
      for (const b of encoded) bytes.push(b);
    }
  }
  try {
    return new TextDecoder("utf-8").decode(Uint8Array.from(bytes));
  } catch {
    return inner;
  }
}

// 把 `diff --git <oldPath> <newPath>` 这一行拆成两个路径，兼容带引号与不带引号两种情形。
// 逻辑：从末尾向前扫，找到合法的第二个路径起点（以 `b/` 或 `"b/` 开头）。
function splitDiffHeader(line: string): [string, string] | null {
  const rest = line.slice("diff --git ".length);
  // 场景 1：两个路径都不含空格 → 按最后一个空格切
  if (!rest.startsWith('"')) {
    const quoteIdx = rest.indexOf('"');
    if (quoteIdx === -1) {
      const mid = rest.lastIndexOf(" ");
      if (mid === -1) return null;
      return [rest.slice(0, mid), rest.slice(mid + 1)];
    }
  }
  // 场景 2/3：存在引号。按状态机拆出两段。
  const segments: string[] = [];
  let i = 0;
  while (i < rest.length && segments.length < 2) {
    while (i < rest.length && rest[i] === " ") i += 1;
    if (i >= rest.length) break;
    if (rest[i] === '"') {
      const start = i;
      i += 1;
      while (i < rest.length) {
        if (rest[i] === "\\" && i + 1 < rest.length) {
          i += 2;
          continue;
        }
        if (rest[i] === '"') {
          i += 1;
          break;
        }
        i += 1;
      }
      segments.push(rest.slice(start, i));
    } else {
      const start = i;
      while (i < rest.length && rest[i] !== " ") i += 1;
      segments.push(rest.slice(start, i));
    }
  }
  if (segments.length !== 2) return null;
  return [segments[0], segments[1]];
}

export function cleanDiffPath(raw: string, projectPath?: string): string {
  const unquoted = unquoteGitPath(raw);
  if (unquoted === "/dev/null") return unquoted;
  const withoutPrefix = unquoted.replace(/^a\//, "").replace(/^b\//, "");
  if (/(^|\/)nezha-empty-[0-9a-f-]+\.tmp$/i.test(withoutPrefix)) {
    return "/dev/null";
  }
  const normalized =
    projectPath?.startsWith("/") && withoutPrefix.startsWith(`${projectPath.slice(1)}/`)
      ? `/${withoutPrefix}`
      : withoutPrefix;
  if (projectPath && normalized.startsWith(`${projectPath}/`)) {
    return normalized.slice(projectPath.length + 1);
  }
  return normalized;
}

export function fileName(path: string): string {
  return path.split("/").pop() ?? path;
}

export function fileDir(path: string): string {
  const parts = path.split("/");
  return parts.length > 1 ? parts.slice(0, -1).join("/") : "";
}

export function plural(count: number, singular: string, pluralLabel = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralLabel}`;
}

function resolveStatus(file: DiffFile): DiffFileStatus {
  const headerJoined = file.headerLines.join("\n");
  if (file.renameFrom && file.renameTo) return "renamed";
  if (/^copy from /m.test(headerJoined) && /^copy to /m.test(headerJoined)) return "copied";
  if (/^new file mode /m.test(headerJoined) || file.oldPath === "/dev/null") return "added";
  if (/^deleted file mode /m.test(headerJoined) || file.newPath === "/dev/null") return "deleted";
  return "modified";
}

function createFile(oldPath: string, newPath: string): DiffFile {
  return {
    oldPath,
    newPath,
    displayPath: newPath || oldPath || "Changed file",
    status: "modified",
    isBinary: false,
    hunks: [],
    headerLines: [],
    additions: 0,
    deletions: 0,
  };
}

export function parseDiff(diff: string, projectPath?: string): DiffFile[] {
  const files: DiffFile[] = [];
  const lines = diff.replace(/\r\n/g, "\n").split("\n");
  let currentFile: DiffFile | null = null;
  let currentHunk: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  const startFile = (line: string) => {
    const parsed = splitDiffHeader(line);
    const oldPath = parsed ? cleanDiffPath(parsed[0], projectPath) : "";
    const newPath = parsed ? cleanDiffPath(parsed[1], projectPath) : "";
    currentFile = createFile(oldPath, newPath);
    currentHunk = null;
    files.push(currentFile);
  };

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      startFile(line);
      continue;
    }

    // 在见到第一个 `diff --git` 之前，任何前导内容（commit hash、Author、空行等）一律丢弃，
    // 避免凭空创建一个 oldPath/newPath 都为空的"假文件块"。
    if (!currentFile) continue;
    // currentFile 仅由 startFile 赋值，TS 无法穿透闭包推断，这里手动断言。
    const file = currentFile as DiffFile;

    if (line.startsWith("--- ")) {
      const cleaned = cleanDiffPath(line.slice(4), projectPath);
      file.oldPath = cleaned;
      file.headerLines.push(line);
      continue;
    }

    if (line.startsWith("+++ ")) {
      const cleaned = cleanDiffPath(line.slice(4), projectPath);
      file.newPath = cleaned;
      file.displayPath = cleaned !== "/dev/null" ? cleaned : file.oldPath;
      file.headerLines.push(line);
      continue;
    }

    if (line.startsWith("rename from ")) {
      file.renameFrom = line.slice("rename from ".length).trim();
      file.headerLines.push(line);
      continue;
    }

    if (line.startsWith("rename to ")) {
      file.renameTo = line.slice("rename to ".length).trim();
      if (!file.newPath || file.newPath === "/dev/null") {
        file.displayPath = file.renameTo;
      }
      file.headerLines.push(line);
      continue;
    }

    if (line.startsWith("Binary files ")) {
      file.isBinary = true;
      file.headerLines.push(line);
      continue;
    }

    if (line.startsWith("@@")) {
      currentHunk = { header: line, rows: [] };
      file.hunks.push(currentHunk);
      const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      oldLine = match ? Number(match[1]) : 0;
      newLine = match ? Number(match[2]) : 0;
      continue;
    }

    if (!currentHunk) {
      if (line.trim()) file.headerLines.push(line);
      continue;
    }

    if (line.startsWith("+")) {
      currentHunk.rows.push({ type: "add", content: line.slice(1), newLine });
      file.additions += 1;
      newLine += 1;
    } else if (line.startsWith("-")) {
      currentHunk.rows.push({ type: "remove", content: line.slice(1), oldLine });
      file.deletions += 1;
      oldLine += 1;
    } else if (line.startsWith(" ")) {
      currentHunk.rows.push({ type: "context", content: line.slice(1), oldLine, newLine });
      oldLine += 1;
      newLine += 1;
    } else if (line.startsWith("\\")) {
      // "\ No newline at end of file"
      currentHunk.rows.push({ type: "meta", content: line });
    } else if (line.trim()) {
      currentHunk.rows.push({ type: "meta", content: line });
    }
  }

  for (const file of files) {
    file.status = resolveStatus(file);
    if (file.status === "renamed" && file.renameTo) {
      file.displayPath = file.renameTo;
    }
  }

  return files.filter(
    (file) => file.hunks.length > 0 || file.headerLines.length > 0 || file.isBinary,
  );
}

export function rowTone(type: DiffLineType) {
  if (type === "add") {
    return {
      bg: "var(--diff-add-bg)",
      markerBg: "var(--diff-add-marker-bg)",
      fg: "var(--diff-add-fg)",
    };
  }
  if (type === "remove") {
    return {
      bg: "var(--diff-delete-bg)",
      markerBg: "var(--diff-delete-marker-bg)",
      fg: "var(--diff-delete-fg)",
    };
  }
  if (type === "meta") {
    return {
      bg: "transparent",
      markerBg: "transparent",
      fg: "var(--diff-meta-fg)",
    };
  }
  return {
    bg: "transparent",
    markerBg: "transparent",
    fg: "var(--text-primary)",
  };
}

export function lineMarker(type: DiffLineType): string {
  if (type === "add") return "+";
  if (type === "remove") return "-";
  return " ";
}

export function statusStyle(status: DiffFileStatus): {
  label: string;
  fg: string;
  bg: string;
} {
  switch (status) {
    case "added":
      return {
        label: "Added",
        fg: "var(--diff-status-added-fg)",
        bg: "var(--diff-status-added-bg)",
      };
    case "deleted":
      return {
        label: "Deleted",
        fg: "var(--diff-status-deleted-fg)",
        bg: "var(--diff-status-deleted-bg)",
      };
    case "renamed":
      return {
        label: "Renamed",
        fg: "var(--diff-status-renamed-fg)",
        bg: "var(--diff-status-renamed-bg)",
      };
    case "copied":
      return {
        label: "Copied",
        fg: "var(--diff-status-renamed-fg)",
        bg: "var(--diff-status-renamed-bg)",
      };
    default:
      return {
        label: "Modified",
        fg: "var(--diff-status-modified-fg)",
        bg: "var(--diff-status-modified-bg)",
      };
  }
}
