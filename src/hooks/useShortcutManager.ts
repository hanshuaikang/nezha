import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppPlatform } from "../platform";
import { APP_SETTINGS_CHANGED_EVENT, type AppSettings } from "../components/app-settings/types";
import {
  getDefaultShortcutBindings,
  getShortcutBinding,
  matchesShortcut,
  formatShortcutLabel,
  hasShortcutModifierPressed,
  hasActiveShortcutIgnoreScope,
  isEditableShortcutTarget,
  normalizeShortcutBindings,
  SHORTCUT_HINT_DELAY_MS,
  type ShortcutBinding,
} from "../shortcuts";

type ShortcutHintGroup = "projects" | "tasks" | null;

export interface ShortcutHintState {
  visibleGroup: ShortcutHintGroup;
  labelsByProjectId: Record<string, string>;
  labelsByTaskId: Record<string, string>;
}

export interface ShortcutProjectSlot {
  id: string;
  onSwitch: () => void;
}

export interface ShortcutTaskSlot {
  id: string;
  onSelect: () => void;
}

export function useShortcutManager({
  platform,
  enabled = true,
  projectSlots,
  taskSlots,
  onNewTask,
  onOpenProjectSwitcher,
}: {
  platform: AppPlatform;
  enabled?: boolean;
  projectSlots: ShortcutProjectSlot[];
  taskSlots: ShortcutTaskSlot[];
  onNewTask: () => void;
  onOpenProjectSwitcher: () => void;
}): ShortcutHintState {
  const [bindings, setBindings] = useState<ShortcutBinding[]>(() =>
    getDefaultShortcutBindings(platform),
  );
  const [visibleGroup, setVisibleGroup] = useState<ShortcutHintGroup>(null);
  const hintTimerRef = useRef<number | null>(null);
  const bindingsRef = useRef(bindings);
  const projectSlotsRef = useRef(projectSlots);
  const taskSlotsRef = useRef(taskSlots);
  const callbacksRef = useRef({ onNewTask, onOpenProjectSwitcher });

  useEffect(() => {
    bindingsRef.current = bindings;
  }, [bindings]);

  useEffect(() => {
    projectSlotsRef.current = projectSlots;
  }, [projectSlots]);

  useEffect(() => {
    taskSlotsRef.current = taskSlots;
  }, [taskSlots]);

  useEffect(() => {
    callbacksRef.current = { onNewTask, onOpenProjectSwitcher };
  }, [onNewTask, onOpenProjectSwitcher]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      invoke<AppSettings>("load_app_settings")
        .then((settings) => {
          if (!cancelled) {
            setBindings(normalizeShortcutBindings(settings.shortcuts, platform));
          }
        })
        .catch(() => {
          if (!cancelled) setBindings(getDefaultShortcutBindings(platform));
        });
    };
    load();
    window.addEventListener(APP_SETTINGS_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(APP_SETTINGS_CHANGED_EVENT, load);
    };
  }, [platform]);

  const labelsByProjectId = useMemo(() => {
    const binding = getShortcutBinding(bindings, "switch_project_slot");
    if (!binding?.enabled) return {};
    return Object.fromEntries(
      projectSlots.slice(0, 9).map((slot, index) => [
        slot.id,
        formatShortcutLabel(binding, platform, index + 1),
      ]),
    );
  }, [bindings, platform, projectSlots]);

  const labelsByTaskId = useMemo(() => {
    const binding = getShortcutBinding(bindings, "switch_task_slot");
    if (!binding?.enabled) return {};
    return Object.fromEntries(
      taskSlots.slice(0, 9).map((slot, index) => [
        slot.id,
        formatShortcutLabel(binding, platform, index + 1),
      ]),
    );
  }, [bindings, platform, taskSlots]);

  useEffect(() => {
    if (!enabled) {
      setVisibleGroup(null);
      return;
    }

    const clearHintTimer = () => {
      if (hintTimerRef.current != null) {
        window.clearTimeout(hintTimerRef.current);
        hintTimerRef.current = null;
      }
    };

    const hideHints = () => {
      clearHintTimer();
      setVisibleGroup((current) => (current == null ? current : null));
    };

    const scheduleHint = (group: Exclude<ShortcutHintGroup, null>) => {
      clearHintTimer();
      hintTimerRef.current = window.setTimeout(() => {
        hintTimerRef.current = null;
        setVisibleGroup((current) => (current === group ? current : group));
      }, SHORTCUT_HINT_DELAY_MS);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) {
        hideHints();
        return;
      }

      const bindings = bindingsRef.current;
      const projectBinding = getShortcutBinding(bindings, "switch_project_slot");
      const taskBinding = getShortcutBinding(bindings, "switch_task_slot");
      const newTaskBinding = getShortcutBinding(bindings, "new_task");
      const switcherBinding = getShortcutBinding(bindings, "open_project_switcher");

      if (hasActiveShortcutIgnoreScope()) {
        hideHints();
        return;
      }

      if (isEditableShortcutTarget(event.target)) {
        hideHints();
        return;
      }

      if (projectBinding) {
        const result = matchesShortcut(event, projectBinding);
        if (result.matched && result.slot != null) {
          const target = projectSlotsRef.current[result.slot - 1];
          if (target) {
            event.preventDefault();
            event.stopPropagation();
            hideHints();
            target.onSwitch();
            return;
          }
        }
      }

      if (taskBinding) {
        const result = matchesShortcut(event, taskBinding);
        if (result.matched && result.slot != null) {
          const target = taskSlotsRef.current[result.slot - 1];
          if (target) {
            event.preventDefault();
            event.stopPropagation();
            hideHints();
            target.onSelect();
            return;
          }
        }
      }

      if (newTaskBinding && matchesShortcut(event, newTaskBinding).matched) {
        event.preventDefault();
        event.stopPropagation();
        hideHints();
        callbacksRef.current.onNewTask();
        return;
      }

      if (switcherBinding && matchesShortcut(event, switcherBinding).matched) {
        event.preventDefault();
        event.stopPropagation();
        hideHints();
        callbacksRef.current.onOpenProjectSwitcher();
        return;
      }

      if (
        projectBinding &&
        projectSlotsRef.current.length > 0 &&
        hasShortcutModifierPressed(event, projectBinding)
      ) {
        scheduleHint("projects");
        return;
      }

      if (
        taskBinding &&
        taskSlotsRef.current.length > 0 &&
        hasShortcutModifierPressed(event, taskBinding)
      ) {
        scheduleHint("tasks");
        return;
      }

      hideHints();
    };

    const handleKeyUp = () => hideHints();
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") hideHints();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    window.addEventListener("blur", hideHints);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      clearHintTimer();
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      window.removeEventListener("blur", hideHints);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled]);

  return { visibleGroup, labelsByProjectId, labelsByTaskId };
}
