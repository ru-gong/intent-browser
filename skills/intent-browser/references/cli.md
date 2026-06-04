# Intent Browser CLI Reference

Use commands from the repository root unless the package has been installed globally.

## Help

```bash
node bin/intent-browser.js --help
```

## Open Targets

```bash
node bin/intent-browser.js samples/demo.html --port 17345 --out ./diffs.ndjson
node bin/intent-browser.js docs/intent-browser-guide.html --port 17345 --out ./diffs.ndjson
node bin/intent-browser.js http://localhost:3000 --port 17345 --out ./diffs.ndjson
```

Windows PowerShell:

```powershell
node .\bin\intent-browser.js .\docs\intent-browser-guide.html --port 17345 --out .\diffs.ndjson
```

## User-Facing Toolbar

- File / 本地文件: choose `.html`, `.htm`, or `.xhtml` without typing a `file://` URL.
- Quick Edit / 快捷编辑: toggle WYSIWYG text, image URL, drag, and simple CSS edits.
- Insert Annotation / 插入批注: toggle spatial feedback bubbles.
- Export to AI / 导出给 AI: save captured events as JSON or NDJSON for offline agent use.
- Panel / 侧栏: hide or show the Diff Payload panel.

## Read Events

```bash
node bin/intent-browser.js read --port 17345 --since 0
node bin/intent-browser.js read --port 17345 --since 4
node bin/intent-browser.js read --port 17345 --format ndjson
```

Track `session.lastSequence` or the highest `event.sequence` and poll only newer events.

## Inspect Session

```bash
node bin/intent-browser.js snapshot --port 17345
```

Use this to confirm current URL, mode, event count, and mode-switch latency.

## Switch Modes

```bash
node bin/intent-browser.js mode preview --port 17345
node bin/intent-browser.js mode quick-edit --port 17345
node bin/intent-browser.js mode annotation --port 17345
```

Mode changes should not refresh the page.

## Install Skill From Source

```bash
npm run install:skill
node scripts/install-skill.js --target ~/.agents/skills
node scripts/install-skill.js --dest /path/to/agent/skills/intent-browser
```

Restart or reload the agent after copying.
