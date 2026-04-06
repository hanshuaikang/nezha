import { useState, useCallback, useRef } from "react";

type RightPanel = "files" | "git-changes" | "git-history" | null;
type OpenFileTab = { path: string; name: string };

type OpenDiff =
  | { kind: "file"; filePath: string; staged: boolean; label: string }
  | { kind: "commit"; hash: string; message: string }
  | { kind: "commit-file"; hash: string; filePath: string; label: string };

export function useProjectPanels() {
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);
  const [openFilesState, setOpenFilesState] = useState<{
    tabs: OpenFileTab[];
    activePath: string | null;
  }>({
    tabs: [],
    activePath: null,
  });
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
    setOpenFilesState((prev) => ({
      tabs: prev.tabs.some((tab) => tab.path === path) ? prev.tabs : [...prev.tabs, { path, name }],
      activePath: path,
    }));
  }, []);

  const handleFileTabSelect = useCallback((path: string) => {
    setOpenFilesState((prev) => ({
      tabs: prev.tabs,
      activePath: prev.tabs.some((tab) => tab.path === path) ? path : prev.activePath,
    }));
  }, []);

  const handleFileTabClose = useCallback((path: string) => {
    setOpenFilesState((prev) => {
      const closingIndex = prev.tabs.findIndex((tab) => tab.path === path);
      if (closingIndex === -1) return prev;

      const nextTabs = prev.tabs.filter((tab) => tab.path !== path);
      const nextActivePath =
        prev.activePath !== path
          ? prev.activePath
          : nextTabs[Math.min(closingIndex, nextTabs.length - 1)]?.path ?? null;

      return {
        tabs: nextTabs,
        activePath: nextActivePath,
      };
    });
  }, []);

  const handleCloseOtherFileTabs = useCallback((path: string) => {
    setOpenFilesState((prev) => {
      const activeTab = prev.tabs.find((tab) => tab.path === path);
      if (!activeTab) return prev;
      return {
        tabs: [activeTab],
        activePath: activeTab.path,
      };
    });
  }, []);

  const handleCloseTabsToRight = useCallback((path: string) => {
    setOpenFilesState((prev) => {
      const activeIndex = prev.tabs.findIndex((tab) => tab.path === path);
      if (activeIndex === -1) return prev;

      const nextTabs = prev.tabs.slice(0, activeIndex + 1);
      return {
        tabs: nextTabs,
        activePath: nextTabs.some((tab) => tab.path === prev.activePath) ? prev.activePath : path,
      };
    });
  }, []);

  const handleCloseAllFileTabs = useCallback(() => {
    setOpenFilesState({
      tabs: [],
      activePath: null,
    });
  }, []);

  const handleDiffFileSelect = useCallback((filePath: string, staged: boolean, label: string) => {
    setOpenDiff({ kind: "file", filePath, staged, label });
  }, []);

  const handleCommitSelect = useCallback((hash: string, message: string) => {
    setOpenDiff({ kind: "commit", hash, message });
  }, []);

  const handleCommitFileClick = useCallback((hash: string, filePath: string, label: string) => {
    setOpenDiff({ kind: "commit-file", hash, filePath, label });
  }, []);

  const clearFileAndDiff = useCallback(() => {
    setOpenFilesState({
      tabs: [],
      activePath: null,
    });
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
    openFiles: openFilesState.tabs,
    activeFilePath: openFilesState.activePath,
    openDiff,
    rightPanelWidth,
    terminalHeight,
    setOpenDiff,
    handleTogglePanel,
    handleFileSelect,
    handleFileTabSelect,
    handleFileTabClose,
    handleCloseOtherFileTabs,
    handleCloseTabsToRight,
    handleCloseAllFileTabs,
    handleDiffFileSelect,
    handleCommitSelect,
    handleCommitFileClick,
    clearFileAndDiff,
    handleRightResizeStart,
    handleTerminalResizeStart,
  };
}

export type { RightPanel, OpenDiff, OpenFileTab };
