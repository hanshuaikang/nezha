<p align="center">
  <img src="docs/images/logo.png" alt="Nezha Logo" width="150" />
</p>

<h1 align="center">Nezha: Three Heads, Six Arms — Programming in Parallel</h1>

<p align="center">
A lightweight cross-platform IDE purpose-built for AI coding.
</p>

<p align="center">
  Multi-Project Workspace · Fast Switching Between AI Sessions Across Projects · Real-time Terminal · Session Auto-discovery · Native Git Integration · Git Worktree Support · Lightweight Code Editor · Skill Management
</p>
<p align="center">
  <a href="https://github.com/hanshuaikang/nezha/actions/workflows/checks.yml"><img alt="Checks" src="https://img.shields.io/github/actions/workflow/status/hanshuaikang/nezha/checks.yml?label=checks"></a>
  <a href="https://github.com/hanshuaikang/nezha/releases"><img alt="Release" src="https://img.shields.io/github/v/release/hanshuaikang/nezha"></a>
  <a href="https://github.com/hanshuaikang/nezha/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/hanshuaikang/nezha"></a>
</p>

<div align="center">
  <table>
    <tr>
      <td align="center">
        <a href="https://www.producthunt.com/products/nezha-2?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-nezha" target="_blank" rel="noopener noreferrer">
          <img alt="NeZha - Run multiple AI coding agents across projects | Product Hunt" src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1120473&theme=light&t=1775898930608" width="150" height="48" />
        </a>
      </td>
      <td align="center">
        <a href="https://hellogithub.com/repository/hanshuaikang/nezha" target="_blank" rel="noopener noreferrer">
          <img src="https://abroad.hellogithub.com/v1/widgets/recommend.svg?rid=4dd4bd67871b461fa8bd3641d803db05&claim_uid=uT2Sc8Xli4PUA76&theme=neutral" alt="Featured｜HelloGitHub" width="155" height="48" />
        </a>
      </td>
    </tr>
  </table>
</div>

<p align="center">
  <img src="docs/images/index.gif" alt="Nezha Product Showcase" width="80%" />
</p>

Nezha is a lightweight cross-platform IDE purpose-built for AI coding. It brings multi-project management, task lifecycle tracking, a native terminal experience, session playback, code browsing, and a complete Git workflow into a single interface — so you no longer need to switch back and forth between the terminal, editor, Git client, and session logs. A few mouse clicks are all it takes to jump between projects or tasks. The installer is just 7MB.

[**中文文档 (Chinese Documentation)**](./README.md)

## Why Nezha?

Traditional IDEs and editors like VS Code are fundamentally built around the human developer. In the era of manual programming, features such as plugin ecosystems, refactoring tools, and variable autocomplete were all designed to boost individual productivity. But today, humans write less code while AI writes more. Coding itself is becoming inherently parallel — something that was unimaginable before. Human attention, however, remains limited. Quickly tracking tasks across multiple projects is precisely the problem Nezha sets out to solve.

Nezha is designed with an Agent-First philosophy. Its built-in terminal directly integrates native Claude Code and Codex, and on top of that it incorporates a task system, Git, Git Worktree, terminal, and code editor. For lighter workflows you no longer need to fire up a heavyweight IDE — you can close the loop on task dispatch, code review, and commits without interrupting your in-progress work on other projects.


## Installing Nezha

Before using Nezha, make sure Claude Code / Codex is already installed. On the first launch you may see *"“NeZha” is damaged and can’t be opened. You should move it to the Trash."* This is caused by the installer being unsigned. Resolve it with the following command:

``` bash
xattr -rd com.apple.quarantine /Applications/nezha.app
```

## Core Features
- Manage multiple Claude Code and Codex sessions across multiple projects inside a single application, boosting your coding throughput 5× and freeing up your attention.
- Built-in notifications: when Claude Code or Codex needs human intervention, system notifications and an app badge surface the prompt automatically.
- Visualized sessions: review the full details of every Claude Code / Codex session directly in the UI, and resume any task at any time.
- A carefully polished UI style with built-in light, dark, and eye-care modes.
- Native Git integration with AI-generated Git messages, with first-class support for Git Worktree workflows underneath.
- A built-in lightweight code editor and Markdown editor with syntax highlighting for every common programming language.
- Skill management: centrally manage all your local skills via symbolic links.


## 🌟 Feature Overview

### 🗂️ Multi-Project Workspace

> **Multi-project workspace — switch between projects in a single click via the right-hand sidebar.**

Use the left-hand project sidebar to instantly toggle between multiple workspaces.

<p align="center">
  <img src="docs/images/workspace.png" alt="Workspace" width="48%" />
  <img src="docs/images/switch-project.png" alt="Switch Project" width="48%" />
</p>

### 📊 Session Management

In a traditional terminal, a session disappears the moment it ends — the only way to revisit it is to resume. In Nezha, sessions are automatically visualized once they finish, making it easy to look back through them. You can also pin important sessions for quick access.

<p align="center">
  <img src="docs/images/task.png" alt="Task View" width="90%" />
</p>


### 📝 Built-in Code & Markdown Editors

A built-in code editor with syntax highlighting for every common programming language, alongside Markdown preview support.

<p align="center">
  <img src="docs/images/code.png" alt="Code Browsing" width="48%" />
  <img src="docs/images/markdown.png" alt="Markdown Editor" width="48%" />
</p>

### 🌳 Git Integration

One-click branch creation, AI-generated Git messages, a dedicated code review view, and Git Worktree workflows integrated directly into the app.


<p align="center">
  <img src="docs/images/git.png" alt="Git Integration" width="90%" />
</p>

### 🎨 A Carefully Polished UI with Light, Dark, and Eye-Care Modes

<p align="center">
  <img src="docs/images/dark.png" alt="Dark Theme" width="48%" />
  <img src="docs/images/light.png" alt="Light Theme" width="48%" />
</p>

## 🙏 Acknowledgments

Nezha would not exist without the following outstanding open-source projects. Our deepest thanks to all of them:

- [Tauri](https://github.com/tauri-apps/tauri) — Build smaller, faster, and more secure desktop applications.
- [React](https://github.com/facebook/react) — The JavaScript library for building user interfaces.
- [xterm.js](https://github.com/xtermjs/xterm.js) — A powerful terminal component for the web.

Thanks to the following media creators for covering and sharing this project (in no particular order). Follow them if you're interested!

| Platform | Account |
| --- | --- |
| Twitter | [@aigclink](https://x.com/aigclink), [@QingQ77](https://x.com/QingQ77), [@ilovek8s](https://x.com/ilovek8s) |
| WeChat Official Account | 码问 |


### 👬 Friend Links
<a href="https://linux.do">Linux.do</a>
