import { useCallback, useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useI18n } from "../../i18n";
import s from "../../styles";
import { writeClipboardText } from "../file-explorer/clipboard";
import { CONTRIBUTORS, SUPPORTERS } from "./thanks-data";

export function ThanksPanel() {
  const { t } = useI18n();
  const [copiedName, setCopiedName] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  const handleCopy = useCallback(async (name: string) => {
    try {
      await writeClipboardText(name);
    } catch {
      return;
    }
    setCopiedName(name);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopiedName(null), 1500);
  }, []);

  const handleOpen = useCallback((url: string) => {
    openUrl(url).catch(() => {});
  }, []);

  return (
    <div style={s.thanksBody}>
      <section style={s.thanksSection}>
        <div style={s.thanksSectionHeader}>
          <div style={s.thanksSectionTitle}>{t("appSettings.thanks.contributorsTitle")}</div>
          <div style={s.thanksSectionDesc}>{t("appSettings.thanks.contributorsDesc")}</div>
        </div>
        <div style={s.thanksGrid}>
          {CONTRIBUTORS.map((c) => (
            <button
              key={c.login}
              type="button"
              className="thanks-card"
              style={s.thanksCard}
              onClick={() => handleOpen(c.profile)}
              title={c.login}
            >
              <img src={c.avatar} alt={c.login} style={s.thanksAvatar} draggable={false} />
              <span style={s.thanksName}>{c.login}</span>
            </button>
          ))}
        </div>
      </section>

      <section style={s.thanksSection}>
        <div style={s.thanksSectionHeader}>
          <div style={s.thanksSectionTitle}>{t("appSettings.thanks.supportersTitle")}</div>
          <div style={s.thanksSectionDesc}>{t("appSettings.thanks.supportersDesc")}</div>
        </div>
        <div style={s.thanksGrid}>
          {SUPPORTERS.map((sp) => {
            const copyable = sp.action === "copy";
            const copied = copyable && copiedName === sp.name;
            return (
              <button
                key={sp.name}
                type="button"
                className="thanks-card"
                style={s.thanksCard}
                onClick={() => (copyable ? handleCopy(sp.name) : sp.link && handleOpen(sp.link))}
                title={
                  copyable
                    ? t("appSettings.thanks.copyName")
                    : t("appSettings.thanks.openLink")
                }
              >
                <img src={sp.avatar} alt={sp.name} style={s.thanksAvatar} draggable={false} />
                <span style={copied ? s.thanksNameCopied : s.thanksName}>
                  {copied ? t("appSettings.thanks.copied") : sp.name}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
