import { AlertTriangle } from "lucide-react";
import type { SkillConflictInfo, SkillInstallStrategy } from "../../types";
import { useI18n } from "../../i18n";
import s from "../../styles";

interface Props {
  conflict: SkillConflictInfo;
  onChoose: (strategy: SkillInstallStrategy) => void;
  onClose: () => void;
}

export function SkillConflictDialog({ conflict, onChoose, onClose }: Props) {
  const { t } = useI18n();

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  const kindKey =
    conflict.existingKind === "symlink"
      ? "skill.conflict.kind.symlink"
      : conflict.existingKind === "file"
        ? "skill.conflict.kind.file"
        : "skill.conflict.kind.directory";

  return (
    <div style={s.skillConflictOverlay} onClick={handleOverlayClick}>
      <div style={s.skillConflictBox} data-shortcut-scope="ignore">
        <div style={s.skillConflictHeader}>
          <AlertTriangle size={18} strokeWidth={2} color="var(--warning)" />
          <span>{t("skill.conflict.title")}</span>
        </div>
        <div style={s.skillConflictBody}>
          <div>{t(kindKey)}</div>
          <div style={s.skillConflictPath}>{conflict.linkPath}</div>
          {conflict.existingTarget ? (
            <div style={s.skillConflictTarget}>
              {t("skill.conflict.currentTarget")} <span>{conflict.existingTarget}</span>
            </div>
          ) : null}
        </div>
        <div style={s.skillConflictFooter}>
          <button
            type="button"
            style={s.modalCancelBtn}
            onClick={() => onChoose("cancel")}
          >
            {t("skill.conflict.cancel")}
          </button>
          <button
            type="button"
            style={s.skillConflictSkipBtn}
            onClick={() => onChoose("skip")}
          >
            {t("skill.conflict.skip")}
          </button>
          <button
            type="button"
            style={s.skillConflictOverwriteBtn}
            onClick={() => onChoose("overwrite")}
          >
            {t("skill.conflict.overwrite")}
          </button>
        </div>
      </div>
    </div>
  );
}
