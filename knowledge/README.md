# Nezha Knowledge Base

面向 agent 与新成员的结构化知识库。**只放 WHY、契约、踩坑结论**——WHAT 由代码自身负责。索引文件只列链接 + 描述 + 标签，正文在子文档。

写作规范见 [`.claude/skills/repo-kb/SKILL.md`](../.claude/skills/repo-kb/SKILL.md) 与 [`reference/core-beliefs.md`](../.claude/skills/repo-kb/reference/core-beliefs.md)。

---

### xterm 终端渲染

| 文档 | 描述 | 标签 |
|------|------|------|
| [终端渲染与选区卡顿排查](./xterm/rendering-and-selection-lag.md) | WKWebView 下 `.xterm` 合成层长帧的真因与定论，含 CSS containment 禁用、WebGL 保留的实测权衡，面向后续动渲染链路前的必读校准 | `xterm`, `wkwebview`, `composite`, `webgl`, `selection`, `regression-guard` |
