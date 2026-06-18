import type React from "react";
import type { NotificationSettings, ToastPosition } from "../../types";
import { VALID_TOAST_POSITIONS } from "../../types";
import { useI18n } from "../../i18n";
import s from "../../styles";

const POSITION_DOT_STYLES: Record<ToastPosition, React.CSSProperties> = {
  "top-left": { top: 4, left: 4 },
  "top-right": { top: 4, right: 4 },
  "bottom-left": { bottom: 4, left: 4 },
  "bottom-right": { bottom: 4, right: 4 },
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
  padding: "14px 18px",
  borderRadius: 12,
  border: "1px solid var(--border-dim)",
  background: "var(--bg-subtle)",
  cursor: "pointer",
  textAlign: "left",
  width: "100%",
  transition: "opacity 0.15s, background 0.12s",
};

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: "var(--text-primary)",
  lineHeight: 1.4,
};

const descStyle: React.CSSProperties = {
  fontSize: 11.5,
  color: "var(--text-hint)",
  lineHeight: 1.45,
  marginTop: 2,
};

function Toggle({ checked, disabled }: { checked: boolean; disabled?: boolean }) {
  return (
    <div
      style={{
        flexShrink: 0,
        width: 44,
        height: 26,
        borderRadius: 999,
        padding: 3,
        background: disabled
          ? "var(--border-dim)"
          : checked
            ? "var(--primary-action-bg)"
            : "var(--border-medium)",

        boxShadow: checked && !disabled ? "0 0 0 4px var(--control-active-bg)" : "none",
        transition: "background 0.12s, box-shadow 0.12s",
      }}
    >
      <div
        style={{
          width: 20,
          height: 20,
          borderRadius: 999,
          background: "var(--control-knob-bg)",
          boxShadow: "var(--shadow-switch-thumb)",
          transform: checked ? "translateX(18px)" : "translateX(0)",
          transition: "transform 0.15s ease",
        }}
      />
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      style={{
        ...rowStyle,
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={labelStyle}>{label}</div>
        {description && <div style={descStyle}>{description}</div>}
      </div>
      <Toggle checked={checked} disabled={disabled} />
    </button>
  );
}

function CheckboxRow({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 18px",
        borderRadius: 10,
        border: "none",
        background: checked && !disabled ? "var(--accent-subtle)" : "transparent",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.45 : 1,
        width: "100%",
        textAlign: "left",
        transition: "background 0.12s, opacity 0.15s",
      }}
    >
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: 5,
          border: checked && !disabled ? "none" : "1.5px solid var(--border-medium)",
          background: checked && !disabled ? "var(--accent)" : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          transition: "background 0.12s, border 0.12s",
        }}
      >
        {checked && !disabled && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M2.5 6L5 8.5L9.5 3.5"
              stroke="white"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
      <span style={{ ...labelStyle, fontSize: 12.5 }}>{label}</span>
    </button>
  );
}

export function NotificationPanel({
  settings,
  onChange,
}: {
  settings: NotificationSettings;
  onChange: (settings: NotificationSettings) => void;
}) {
  const { t } = useI18n();

  function update(partial: Partial<NotificationSettings>) {
    onChange({ ...settings, ...partial });
  }

  function updateType(key: keyof NotificationSettings["types"], value: boolean) {
    onChange({ ...settings, types: { ...settings.types, [key]: value } });
  }

  const disabled = !settings.enabled;

  return (
    <div
      style={{ ...s.settingsBody, display: "flex", flexDirection: "column", gap: 8, padding: 20 }}
    >
      <ToggleRow
        label={t("notif.masterToggle")}
        description={t("notif.masterToggleDesc")}
        checked={settings.enabled}
        onChange={() => update({ enabled: !settings.enabled })}
      />
      <ToggleRow
        label={t("notif.inAppToggle")}
        description={t("notif.inAppToggleDesc")}
        checked={settings.inApp}
        disabled={disabled}
        onChange={() => update({ inApp: !settings.inApp })}
      />
      <ToggleRow
        label={t("notif.systemToggle")}
        description={t("notif.systemToggleDesc")}
        checked={settings.system}
        disabled={disabled}
        onChange={() => update({ system: !settings.system })}
      />
      <ToggleRow
        label={t("notif.soundToggle")}
        description={t("notif.soundToggleDesc")}
        checked={settings.sound}
        disabled={disabled}
        onChange={() => update({ sound: !settings.sound })}
      />

      {/* Toast Position */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 14,
          padding: "14px 18px",
          borderRadius: 12,
          border: "1px solid var(--border-dim)",
          background: "var(--bg-subtle)",
          opacity: disabled ? 0.45 : 1,
          transition: "opacity 0.15s",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={labelStyle}>{t("notif.toastPosition")}</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {VALID_TOAST_POSITIONS.map((pos) => {
            const active = settings.toastPosition === pos;
            return (
              <button
                key={pos}
                disabled={disabled}
                onClick={() => update({ toastPosition: pos })}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  border: active
                    ? "1.5px solid var(--accent)"
                    : "1.5px solid var(--border-medium)",
                  background: active ? "var(--accent-subtle)" : "transparent",
                  cursor: disabled ? "default" : "pointer",
                  position: "relative",
                  transition: "background 0.12s, border 0.12s",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: active ? "var(--accent)" : "var(--text-hint)",
                    opacity: active ? 1 : 0.35,
                    transition: "background 0.12s, opacity 0.12s",
                    ...POSITION_DOT_STYLES[pos],
                  }}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Type Filter */}
      <div
        style={{
          fontSize: 11.5,
          fontWeight: 600,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginTop: 12,
          marginBottom: 2,
          paddingLeft: 4,
          opacity: disabled ? 0.45 : 1,
          transition: "opacity 0.15s",
        }}
      >
        {t("notif.typeFilterLabel")}
      </div>

      <CheckboxRow
        label={t("notif.typeDone")}
        checked={settings.types.done}
        disabled={disabled}
        onChange={() => updateType("done", !settings.types.done)}
      />
      <CheckboxRow
        label={t("notif.typeFailed")}
        checked={settings.types.failed}
        disabled={disabled}
        onChange={() => updateType("failed", !settings.types.failed)}
      />
      <CheckboxRow
        label={t("notif.typeIdle")}
        checked={settings.types.idle}
        disabled={disabled}
        onChange={() => updateType("idle", !settings.types.idle)}
      />
      <CheckboxRow
        label={t("notif.typeInputRequired")}
        checked={settings.types.input_required}
        disabled={disabled}
        onChange={() =>
          updateType("input_required", !settings.types.input_required)
        }
      />
    </div>
  );
}
