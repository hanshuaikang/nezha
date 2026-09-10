import { useEffect, useRef, useState } from "react";
import { RotateCcw, Sparkles, X } from "lucide-react";
import type { Project, ProjectAvatarColor, ProjectAvatarStyle } from "../../types";
import { ProjectAvatar } from "../ProjectAvatar";
import { useProjectAppearance } from "../../hooks/useProjectAppearance";
import {
  PROJECT_AVATAR_COLORS,
  PROJECT_AVATAR_EMOJI_PRESETS,
  firstGrapheme,
  normalizeProjectAvatar,
  takeLabel,
} from "../../projectAvatar";
import { shortenPath } from "../../utils";
import { useI18n } from "../../i18n";
import { APP_PLATFORM, type AppPlatform } from "../../platform";

type IconMode = "label" | "emoji";

// 系统 emoji 键盘快捷键提示;Linux 各桌面环境不统一,不给提示。
const EMOJI_KEYBOARD_SHORTCUT: Record<AppPlatform, string | null> = {
  macos: "⌃ ⌘ Space",
  windows: "Win + .",
  other: null,
};

/**
 * 项目头像外观编辑器(弹层正文):图标(缩写 / emoji)+ 预设色板 + 恢复默认。
 * 所有改动即时生效并由调用方持久化,没有确认按钮——rail 上的真实头像就是预览。
 */
export function ProjectAppearanceEditor({
  project,
  onChange,
}: {
  project: Project;
  onChange: (avatar: ProjectAvatarStyle | undefined) => void;
}) {
  const { t } = useI18n();
  const appearance = useProjectAppearance(project);
  const avatar = project.avatar;
  const [mode, setMode] = useState<IconMode>(avatar?.emoji ? "emoji" : "label");
  const [labelDraft, setLabelDraft] = useState(avatar?.label ?? "");
  const [emojiDraft, setEmojiDraft] = useState(avatar?.emoji ?? "");

  // 恢复默认 / 其他入口改动时把草稿同步回来
  useEffect(() => {
    setLabelDraft(avatar?.label ?? "");
  }, [avatar?.label]);
  useEffect(() => {
    setEmojiDraft(avatar?.emoji ?? "");
  }, [avatar?.emoji]);

  const commit = (patch: Partial<ProjectAvatarStyle>) => {
    onChange(normalizeProjectAvatar({ ...avatar, ...patch }));
  };

  // 中文 / 日文等输入法在组合期间会持续触发 onChange(内容是拼音、假名),此时若截断并
  // 回写受控值,组合就被打断,汉字根本打不出来。组合期间只回显原文、不提交,
  // compositionend 后再归一化 + 提交。input 与 compositionend 的先后顺序各引擎不同,
  // 两个回调都按 composingRef 判断,哪个后到就由哪个完成提交。
  const composingRef = useRef(false);

  const handleLabelInput = (value: string) => {
    const next = takeLabel(value);
    setLabelDraft(next);
    commit({ label: next || undefined });
  };

  const handleLabelChange = (value: string) => {
    if (composingRef.current) {
      setLabelDraft(value);
      return;
    }
    handleLabelInput(value);
  };

  const handleEmojiPick = (value: string) => {
    const next = firstGrapheme(value);
    setEmojiDraft(next);
    commit({ emoji: next || undefined });
  };

  const handleEmojiChange = (value: string) => {
    if (composingRef.current) {
      setEmojiDraft(value);
      return;
    }
    handleEmojiPick(value);
  };

  // 两种图标互斥显示:切回「缩写」即放弃 emoji,否则头像仍显示 emoji、缩写输入看不到效果。
  // 切到「Emoji」不立刻改动,选中一个才生效。
  const switchMode = (next: IconMode) => {
    setMode(next);
    if (next === "label" && avatar?.emoji) {
      setEmojiDraft("");
      commit({ emoji: undefined });
    }
  };

  const handleReset = () => {
    setMode("label");
    onChange(undefined);
  };

  const shortcut = EMOJI_KEYBOARD_SHORTCUT[APP_PLATFORM];
  const isCustomized = Boolean(avatar);

  return (
    <div className="avatar-editor">
      <div className="avatar-editor-preview">
        <ProjectAvatar project={project} size={44} />
        <div className="avatar-editor-preview-text">
          <div className="avatar-editor-preview-name">{project.name}</div>
          <div className="avatar-editor-preview-path">{shortenPath(project.path)}</div>
        </div>
      </div>

      <div className="avatar-editor-section">
        <div className="avatar-editor-section-head">
          <span className="avatar-editor-label">{t("project.appearance.icon")}</span>
          <div className="avatar-editor-modes" role="tablist">
            <button
              type="button"
              role="tab"
              className="avatar-editor-mode"
              aria-selected={mode === "label"}
              data-selected={mode === "label"}
              onClick={() => switchMode("label")}
            >
              {t("project.appearance.modeInitials")}
            </button>
            <button
              type="button"
              role="tab"
              className="avatar-editor-mode"
              aria-selected={mode === "emoji"}
              data-selected={mode === "emoji"}
              onClick={() => switchMode("emoji")}
            >
              {t("project.appearance.modeEmoji")}
            </button>
          </div>
        </div>

        {mode === "label" ? (
          <>
            <input
              className="avatar-editor-input"
              value={labelDraft}
              placeholder={t("project.appearance.labelPlaceholder", {
                label: appearance.autoLabel,
              })}
              aria-label={t("project.appearance.modeInitials")}
              spellCheck={false}
              autoComplete="off"
              onCompositionStart={() => {
                composingRef.current = true;
              }}
              onCompositionEnd={(event) => {
                composingRef.current = false;
                handleLabelInput(event.currentTarget.value);
              }}
              onChange={(event) => handleLabelChange(event.target.value)}
            />
            <div className="avatar-editor-hint">{t("project.appearance.labelHint")}</div>
          </>
        ) : (
          <>
            <div className="avatar-editor-emoji-row">
              <input
                className="avatar-editor-input avatar-editor-emoji-input"
                value={emojiDraft}
                placeholder={t("project.appearance.emojiPlaceholder")}
                aria-label={t("project.appearance.modeEmoji")}
                spellCheck={false}
                autoComplete="off"
                onCompositionStart={() => {
                  composingRef.current = true;
                }}
                onCompositionEnd={(event) => {
                  composingRef.current = false;
                  handleEmojiPick(event.currentTarget.value);
                }}
                onChange={(event) => handleEmojiChange(event.target.value)}
              />
              {emojiDraft && (
                <button
                  type="button"
                  className="avatar-editor-clear"
                  onClick={() => handleEmojiPick("")}
                  aria-label={t("project.appearance.clearEmoji")}
                  title={t("project.appearance.clearEmoji")}
                >
                  <X size={12} strokeWidth={2.2} />
                </button>
              )}
            </div>
            <div className="avatar-editor-emoji-grid">
              {PROJECT_AVATAR_EMOJI_PRESETS.map((emoji) => (
                <button
                  type="button"
                  key={emoji}
                  className="avatar-editor-emoji"
                  data-selected={emoji === emojiDraft}
                  onClick={() => handleEmojiPick(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
            {shortcut && (
              <div className="avatar-editor-hint">
                {t("project.appearance.emojiHint", { shortcut })}
              </div>
            )}
          </>
        )}
      </div>

      <div className="avatar-editor-section">
        <div className="avatar-editor-section-head">
          <span className="avatar-editor-label">{t("project.appearance.color")}</span>
        </div>
        <div className="avatar-editor-swatches" role="radiogroup">
          <button
            type="button"
            role="radio"
            className="avatar-editor-swatch"
            data-avatar-color={appearance.autoColor}
            data-auto="true"
            data-selected={!avatar?.color}
            aria-checked={!avatar?.color}
            aria-label={t("project.appearance.autoColor")}
            title={t("project.appearance.autoColor")}
            onClick={() => commit({ color: undefined })}
          >
            <Sparkles size={11} strokeWidth={2.4} />
          </button>
          {PROJECT_AVATAR_COLORS.map((color: ProjectAvatarColor) => {
            const name = t(`project.appearance.color.${color}`);
            return (
              <button
                type="button"
                role="radio"
                key={color}
                className="avatar-editor-swatch"
                data-avatar-color={color}
                data-selected={avatar?.color === color}
                aria-checked={avatar?.color === color}
                aria-label={name}
                title={name}
                onClick={() => commit({ color })}
              />
            );
          })}
        </div>
      </div>

      <div className="avatar-editor-footer">
        <button
          type="button"
          className="avatar-editor-reset"
          disabled={!isCustomized}
          onClick={handleReset}
        >
          <RotateCcw size={12} strokeWidth={2} />
          {t("project.appearance.reset")}
        </button>
      </div>
    </div>
  );
}
