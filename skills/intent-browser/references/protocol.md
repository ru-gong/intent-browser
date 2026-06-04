# Intent Browser Protocol Reference

Default endpoint:

```text
http://127.0.0.1:17345
```

## HTTP

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Liveness check and session snapshot |
| `GET` | `/session` | Current session, mode, URL, event count, and latency metrics |
| `GET` | `/events?since=<sequence>` | JSON events after a sequence number |
| `GET` | `/events.ndjson?since=<sequence>` | NDJSON event export |
| `POST` | `/mode` | Body: `{"mode":"preview|quick-edit|annotation"}` |
| `POST` | `/navigate` | Body: `{"url":"http://localhost:3000"}` |

## WebSocket JSON-RPC

Connect to:

```text
ws://127.0.0.1:17345/rpc
```

Supported requests:

```json
{"jsonrpc":"2.0","id":1,"method":"session.get"}
{"jsonrpc":"2.0","id":2,"method":"events.list","params":{"since":0}}
{"jsonrpc":"2.0","id":3,"method":"mode.set","params":{"mode":"quick-edit"}}
{"jsonrpc":"2.0","id":4,"method":"page.navigate","params":{"url":"http://localhost:3000"}}
```

Broadcast notifications include `session`, `mode`, and `diff`.

## Payload Interpretation

Prefer locators in this order:

1. Explicit source hints: `target.source`, `data-source-file`, `data-component`, `data-line`.
2. Stable selector: `target.cssSelector`, especially `id`, `data-testid`, ARIA, and stable attributes.
3. Framework/debug metadata when present.
4. XPath and DOM path fallback.
5. Coordinates for spatial intent and visual disambiguation.

Common actions:

- `text.replace`: edit text in the source component or content file.
- `value.replace`: update input/value defaults or controlled state.
- `image.src.replace`: update image source, asset URL, or component prop.
- `style.update`: update CSS, class names, inline style, or layout props.
- `annotation.create`: treat the text as human feedback anchored to the target metadata and coordinates.

The browser mutates the live DOM only for immediate feedback. Durable changes must be made by the agent in source code.
