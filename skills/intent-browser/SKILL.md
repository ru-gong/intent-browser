---
name: intent-browser
description: Use when a user wants to launch, install, control, or consume Intent Browser / 灵犀页镜 for AI-agent page debugging, Quick Edit, Insert Annotation, local HTML review, AI handoff export, or Diff Payload driven code changes. Trigger when the user mentions Intent Browser, 灵犀页镜, agent browser, page feedback browser, quick edit, insert annotation, annotation payloads, AI export, or reading page interaction diffs.
---

# Intent Browser Skill

Intent Browser / 灵犀页镜 is an Electron browser that turns human page feedback into agent-readable Diff Payloads. Use it as the bridge between a user's visual edits or annotations and source-code changes.

## When To Trigger

Use this skill when the user wants to:

- Open a generated page, local HTML file, localhost app, or remote URL for visual review.
- Let a human make Quick Edit changes or Insert Annotation feedback on a page.
- Read structured page interaction events from the CLI, HTTP API, WebSocket JSON-RPC, JSON export, or NDJSON export.
- Convert captured Diff Payloads into source-code edits, then reopen the page for user verification.
- Install this repository's bundled Skill into an agent's skill directory.

Do not use this skill for unrelated browser automation, general web research, or backend-only application debugging.

## What It Can Do

- Launch the GUI around a target page without refreshing during mode changes.
- Toggle `preview`, `quick-edit`, and `annotation` modes through CLI/API.
- Capture `text.replace`, `value.replace`, `image.src.replace`, `style.update`, and `annotation.create` events.
- Provide robust target metadata: CSS selector, XPath, DOM path, source hints, coordinates, and CDP backend node ids when available.
- Export captured feedback for offline AI use through the toolbar's Export to AI button.
- Let agents poll events, read NDJSON, or subscribe through JSON-RPC.

## Source Install For Agents

From the repository root, install dependencies first:

```bash
npm install
```

Install the bundled Skill into the default Codex skill directory:

```bash
npm run install:skill
```

Default destination:

- `$CODEX_HOME/skills/intent-browser` when `CODEX_HOME` is set.
- `~/.codex/skills/intent-browser` otherwise.

For another compatible agent, pass the skills root:

```bash
node scripts/install-skill.js --target ~/.agents/skills
```

Or pass the exact destination directory:

```bash
node scripts/install-skill.js --dest /path/to/agent/skills/intent-browser
```

After installation, restart or reload the agent so it can discover `$intent-browser`.

## Core Usage

Launch a page for human review:

```bash
node bin/intent-browser.js docs/intent-browser-guide.html --port 17345 --out ./diffs.ndjson
```

Launch a local dev app:

```bash
node bin/intent-browser.js http://localhost:3000 --port 17345 --out ./diffs.ndjson
```

Read all captured events:

```bash
node bin/intent-browser.js read --port 17345 --since 0
```

Read stream-style NDJSON:

```bash
node bin/intent-browser.js read --port 17345 --format ndjson
```

Switch modes without refreshing:

```bash
node bin/intent-browser.js mode quick-edit --port 17345
node bin/intent-browser.js mode annotation --port 17345
node bin/intent-browser.js mode preview --port 17345
```

See `references/cli.md` for command details. See `references/protocol.md` for payload interpretation.

## How To Work With The User

1. Start or reuse Intent Browser with the target page.
2. Tell the user what to do in plain language:
   - Use Quick Edit to directly change text, image links, or simple layout values.
   - Use Insert Annotation to pin feedback bubbles on specific page regions.
   - Use Export to AI if the agent did not launch the app or if the user needs offline handoff.
3. While the user works, poll `read --since <lastSequence>` or subscribe to `/rpc`.
4. Treat each payload as an instruction grounded in DOM/source metadata. Prefer stable source hints such as `data-source-file`, `data-component`, `data-testid`, selector, and XPath.
5. Modify the user's source code, not only the live DOM. The browser is a feedback collector; compilation and durable code changes belong on the agent side.
6. Run tests or syntax checks appropriate to the project.
7. Reopen or reload the page in Intent Browser and ask the user to verify the result.

If the user gives you an exported JSON/NDJSON file instead of a live port, parse it and follow the same payload-to-code workflow.

## Failure Handling

- If the GUI is not reachable, check `node bin/intent-browser.js snapshot --port 17345`.
- If events are missing, confirm the user clicked Quick Edit or Insert Annotation before interacting.
- If an annotation bubble is near an edge, rely on payload coordinates and selector metadata rather than visual assumptions.
- If a local port is blocked, restart with a different `--port` and read from that port.
