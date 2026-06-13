/**
 * xterm.js 6 私有 API 类型契约（半公开）。
 *
 * 让 `terminalShared.ts` 里 `applyDomCharSizeOverride()` 对 `_core` /
 * `_charSizeService` / `_measureStrategy` 的访问显式可见——比 `as any` 更可
 * grep、更可 review。同款做法：OpenSumi
 * `packages/terminal-next/src/common/xterm-private.d.ts`。
 *
 * 升级 xterm 时检查（源参考 `node_modules/@xterm/xterm/src/browser/services/CharSizeService.ts`）：
 *   - `Terminal._core._charSizeService._measureStrategy.measure()` 是否仍存在
 *   - `IMeasureResult` 字段是否仍是 `{ width, height }`
 *
 * 字段名在 minified bundle 中未被 mangle（DI service token + class field），
 * 但 xterm 团队不承诺稳定。
 */

import type { Terminal } from "@xterm/xterm";

export interface XTermMeasureResult {
  width: number;
  height: number;
}

export interface XTermMeasureStrategy {
  measure(): Readonly<XTermMeasureResult>;
}

export interface XTermCharSizeService {
  width: number;
  height: number;
  readonly hasValidSize: boolean;
  measure(): void;
  _measureStrategy: XTermMeasureStrategy;
}

export interface XTermCore {
  _charSizeService?: XTermCharSizeService;
}

/** 包含 `_core` 私有入口的 Terminal——命名带 "Private" 便于 grep 定位。 */
export interface XTermWithPrivates extends Terminal {
  readonly _core: XTermCore;
}
