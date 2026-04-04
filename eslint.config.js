import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  // 忽略构建产物与生成文件
  {
    ignores: ["dist/**", "src-tauri/**", "node_modules/**", "*.config.js"],
  },

  // JavaScript 基础规则
  js.configs.recommended,

  // TypeScript 推荐规则（不启用类型感知规则，避免过度配置）
  ...tseslint.configs.recommended,

  // React 规则
  {
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooks,
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      // React Hooks 规则：违反会导致运行时 bug，必须开启
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // React 17+ JSX transform，无需手动 import React
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",

      // TypeScript 调整：已有代码存在少量 any，初期用 warn 而非 error
      "@typescript-eslint/no-explicit-any": "warn",
      // 允许未使用变量以 _ 开头的命名惯例
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      // 禁止 console.log 遗留（warn 级别，生产前清理）
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },

  // 关闭与 Prettier 冲突的格式化规则（必须放在最后）
  prettier,
);
