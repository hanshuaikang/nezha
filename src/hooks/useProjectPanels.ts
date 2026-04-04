import { useState, useCallback, useRef } from "react";

type RightPanel = "files" | "git-changes" | "git-history" | null;

type OpenDiff =
  | { kind: "file"; filePath: string; staged: boolean; label: string }
  | { kind: "commit"; hash: string; message: string }
  | { kind: "commit-file"; hash: string; filePath: string; label: string };

export function useProjectPanels() {
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);
  const [openFile, setOpenFile] = useState<{ path: string; name: string } | null>(null);
  const [openDiff, setOpenDiff] = useState<OpenDiff | null>(null);
  const [rightPanelWidth, setRightPanelWidth] = useState(280);
  const [terminalHeight, setTerminalHeight] = useState(240);
  const rightPanelWidthRef = useRef(rightPanelWidth);
  rightPanelWidthRef.current = rightPanelWidth;
  const terminalHeightRef = useRef(terminalHeight);
  terminalHeightRef.current = terminalHeight;

  const handleTogglePanel = useCallback((panel: "files" | "git-changes" | "git-history") => {
    setRightPanel((prev) => (prev === panel ? null : panel));
  }, []);

  const handleFileSelect = useCallback((path: string, name: string) => {
    setOpenDiff(null);
    setOpenFile({ path, name });
  }, []);

  const handleDiffFileSelect = useCallback((filePath: string, staged: boolean, label: string) => {
    setOpenFile(null);
    setOpenDiff({ kind: "file", filePath, staged, label });
  }, []);

  const handleCommitSelect = useCallback((hash: string, message: string) => {
    setOpenFile(null);
    setOpenDiff({ kind: "commit", hash, message });
  }, []);

  const handleCommitFileClick = useCallback((hash: string, filePath: string, label: string) => {
    setOpenFile(null);
    setOpenDiff({ kind: "commit-file", hash, filePath, label });
  }, []);

  const clearFileAndDiff = useCallback(() => {
    setOpenFile(null);
    setOpenDiff(null);
  }, []);

  const handleRightResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = rightPanelWidthRef.current;
    const onMouseMove = (ev: MouseEvent) => {
      const newWidth = Math.max(180, Math.min(600, startWidth + (startX - ev.clientX)));
      setRightPanelWidth(newWidth);
    };
    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, []);

  const handleTerminalResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = terminalHeightRef.current;
    const onMouseMove = (ev: MouseEvent) => {
      const newHeight = Math.max(100, Math.min(600, startHeight + (startY - ev.clientY)));
      setTerminalHeight(newHeight);
    };
    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, []);

  return {
    rightPanel,
    openFile,
    openDiff,
    rightPanelWidth,
    terminalHeight,
    setOpenFile,
    setOpenDiff,
    handleTogglePanel,
    handleFileSelect,
    handleDiffFileSelect,
    handleCommitSelect,
    handleCommitFileClick,
    clearFileAndDiff,
    handleRightResizeStart,
    handleTerminalResizeStart,
  };
}

export type { RightPanel, OpenDiff };
