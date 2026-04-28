import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { ExternalLink, Star } from "lucide-react";
import { useI18n } from "../../i18n";
import s from "../../styles";
import appLogo from "../../assets/app-logo.png";

const GITHUB_REPO_URL = "https://github.com/hanshuaikang/nezha";

export function AboutPanel() {
  const { t } = useI18n();
  const [appVersion, setAppVersion] = useState("");

  useEffect(() => {
    getVersion()
      .then((version) => setAppVersion(version))
      .catch(() => setAppVersion(t("common.unknown")));
  }, [t]);

  return (
    <div
      style={{
        ...s.settingsBody,
        display: "flex",
        flexDirection: "column",
        padding: "20px",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 16,
          padding: "18px",
          borderRadius: 12,
          border: "1px solid var(--border-dim)",
          background: "var(--bg-subtle)",
        }}
      >
        <img
          src={appLogo}
          alt="NeZha logo"
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            flexShrink: 0,
            objectFit: "cover",
          }}
        />

        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>NeZha</div>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 4 }}>
              {t("appSettings.nezhaDescription")}
            </div>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-hint)", marginBottom: 4 }}>
                {t("appSettings.version")}
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {appVersion || t("common.loading")}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, color: "var(--text-hint)", marginBottom: 4 }}>
                {t("appSettings.github")}
              </div>
              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  color: "var(--accent)",
                  fontSize: 12.5,
                  textDecoration: "none",
                  wordBreak: "break-all",
                }}
              >
                {GITHUB_REPO_URL}
                <ExternalLink size={13} />
              </a>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              padding: "10px 12px",
              borderRadius: 10,
              background: "color-mix(in srgb, var(--accent) 8%, transparent)",
              color: "var(--text-secondary)",
              fontSize: 12.5,
              lineHeight: 1.5,
            }}
          >
            <Star size={14} color="var(--accent)" style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              {t("appSettings.starHint")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
