# Agent Debug Browser Protocol

## HTTP

Base URL defaults to `http://127.0.0.1:17345`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Liveness check plus session snapshot. |
| `GET` | `/session` | Current session, mode, URL, event count, latency metrics. |
| `GET` | `/events?since=0` | JSON list of diff payloads after a sequence number. |
| `GET` | `/events.ndjson?since=0` | NDJSON stream-style export of diff payloads. |
| `POST` | `/mode` | Body: `{"mode":"preview|quick-edit|annotation"}`. |
| `POST` | `/navigate` | Body: `{"url":"http://localhost:3000"}`. |

## WebSocket JSON-RPC

Connect to `ws://127.0.0.1:17345/rpc`.

Requests:

```json
{"jsonrpc":"2.0","id":1,"method":"session.get","params":{}}
{"jsonrpc":"2.0","id":2,"method":"events.list","params":{"since":0}}
{"jsonrpc":"2.0","id":3,"method":"mode.set","params":{"mode":"quick-edit"}}
{"jsonrpc":"2.0","id":4,"method":"page.navigate","params":{"url":"http://localhost:3000"}}
```

Server notifications:

```json
{"jsonrpc":"2.0","method":"diff","params":{ "...": "DiffPayload" }}
{"jsonrpc":"2.0","method":"mode","params":{ "mode": "annotation" }}
{"jsonrpc":"2.0","method":"session","params":{ "...": "SessionSnapshot" }}
```

## Diff Payload

```json
{
  "schemaVersion": "1.0.0",
  "eventId": "target-1760000000000-1",
  "sessionId": "adb-...",
  "sequence": 1,
  "timestamp": "2026-05-31T12:00:00.000Z",
  "mode": "quick-edit",
  "action": "text.replace",
  "page": {
    "url": "http://localhost:3000",
    "title": "Demo",
    "viewport": {
      "width": 1024,
      "height": 768,
      "scrollX": 0,
      "scrollY": 0,
      "devicePixelRatio": 2
    }
  },
  "target": {
    "tagName": "h1",
    "cssSelector": "h1[data-testid=\"hero-title\"]",
    "xpath": "/html[1]/body[1]/main[1]/section[1]/div[1]/h1[1]",
    "domPath": [],
    "attributes": {
      "data-testid": "hero-title"
    },
    "textSample": "Debug visual changes at the speed of thought.",
    "source": {
      "explicit": {
        "data-component": "HeroPanel"
      },
      "explicitScope": "ancestor",
      "explicitAncestor": {
        "distance": 2,
        "tagName": "section",
        "cssSelector": "section[data-component=\"HeroPanel\"]"
      },
      "react": null,
      "vue": null
    },
    "cdp": {
      "backendNodeId": 42,
      "frameId": "..."
    },
    "rect": {
      "x": 40,
      "y": 80,
      "width": 580,
      "height": 110
    },
    "coordinates": {
      "viewport": { "x": 210, "y": 128 },
      "page": { "x": 210, "y": 128 },
      "element": { "x": 170, "y": 48, "rx": 0.29, "ry": 0.44 }
    }
  },
  "change": {
    "before": "Old copy",
    "after": "New copy"
  },
  "interaction": {
    "type": "dblclick",
    "pointerType": "mouse",
    "point": {
      "viewport": { "x": 210, "y": 128 },
      "page": { "x": 210, "y": 128 }
    },
    "modifiers": {
      "alt": false,
      "ctrl": false,
      "meta": false,
      "shift": false
    }
  },
  "provenance": {
    "client": "agent-debug-browser",
    "runtime": "electron-isolated-preload",
    "overlayMode": "quick-edit"
  }
}
```

`action` currently includes:

- `text.replace`
- `value.replace`
- `image.src.replace`
- `style.update`
- `annotation.create`
