import type { CSSProperties } from "react";

export const appSettingsSectionStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  paddingBottom: 20,
  borderBottom: "1px solid var(--border-dim)",
};

export const appSettingsLastSectionStyle: CSSProperties = {
  ...appSettingsSectionStyle,
  paddingBottom: 0,
  borderBottom: "none",
};

export const appSettingsSectionTitleStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "var(--text-primary)",
  marginBottom: 12,
};

export const appSettingsLabelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-secondary)",
  marginBottom: 5,
  display: "block",
};

export const appSettingsHintStyle: CSSProperties = {
  fontSize: 11,
  color: "var(--text-hint)",
  marginTop: 3,
};
