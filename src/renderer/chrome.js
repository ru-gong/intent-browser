(function () {
  const api = window.agentDebugChrome;
  const params = new URLSearchParams(window.location.search);
  const role = params.get('role') || 'toolbar';
  const app = document.getElementById('app');
  const events = [];
  const copy = languageCopy();
  document.title = copy.chromeTitle;
  let state = null;

  const icons = {
    brand: '<svg viewBox="0 0 24 24"><path d="M12 3l7.5 4.5v9L12 21l-7.5-4.5v-9L12 3z"></path><path d="M12 8v8"></path><path d="M8 10.3l4 2.3 4-2.3"></path></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"></path></svg>',
    forward: '<svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"></path></svg>',
    reload: '<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.64-6.36"></path><path d="M21 3v6h-6"></path></svg>',
    file: '<svg viewBox="0 0 24 24"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z"></path><path d="M8 13h8"></path></svg>',
    go: '<svg viewBox="0 0 24 24"><path d="M5 12h14"></path><path d="M13 6l6 6-6 6"></path></svg>',
    eye: '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
    edit: '<svg viewBox="0 0 24 24"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path></svg>',
    note: '<svg viewBox="0 0 24 24"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"></path></svg>'
  };

  function render() {
    if (role === 'toolbar') {
      renderToolbar();
    } else {
      renderPanel();
    }
  }

  function renderToolbar() {
    const target = state && state.target ? state.target : {};
    app.className = 'toolbar';
    app.innerHTML = `
      <div class="toolbar-left">
        <div class="brand-block" title="${escapeAttribute(copy.appName)}">
          <div class="brand">${icons.brand}</div>
          <div class="brand-copy">
            <strong>${escapeHtml(copy.appName)}</strong>
            <span>${escapeHtml(copy.appCaption)}</span>
          </div>
        </div>
        <button class="nav-button" data-action="back" title="${escapeAttribute(copy.nav.backHelp)}" ${target.canGoBack ? '' : 'disabled'}>
          ${icons.back}<span>${escapeHtml(copy.nav.back)}</span>
        </button>
        <button class="nav-button" data-action="forward" title="${escapeAttribute(copy.nav.forwardHelp)}" ${target.canGoForward ? '' : 'disabled'}>
          ${icons.forward}<span>${escapeHtml(copy.nav.forward)}</span>
        </button>
        <button class="nav-button" data-action="reload" title="${escapeAttribute(copy.nav.reloadHelp)}">
          ${icons.reload}<span>${escapeHtml(copy.nav.reload)}</span>
        </button>
      </div>
      <form class="url-form" aria-label="${escapeAttribute(copy.url.aria)}">
        <input class="url-input" name="url" spellcheck="false" placeholder="${escapeAttribute(copy.url.placeholder)}" value="${escapeAttribute(state && state.url ? state.url : '')}">
        <button class="file-button" type="button" data-action="open-file" title="${escapeAttribute(copy.nav.openFileHelp)}">
          ${icons.file}<span>${escapeHtml(copy.nav.openFile)}</span>
        </button>
        <button class="go-button" title="${escapeAttribute(copy.nav.goHelp)}">
          ${icons.go}<span>${escapeHtml(copy.nav.go)}</span>
        </button>
      </form>
      <div class="toolbar-right">
        <div class="modes" aria-label="${escapeAttribute(copy.modesLabel)}">
          ${modeButton('preview', icons.eye)}
          ${modeButton('quick-edit', icons.edit)}
          ${modeButton('annotation', icons.note)}
        </div>
        <div class="endpoint" title="${escapeAttribute(copy.panel.agentPortHelp)}">
          <span>${escapeHtml(copy.panel.agentPortShort)}</span>
          <strong>${escapeHtml(endpointText().replace(/^https?:\/\//, ''))}</strong>
        </div>
      </div>
    `;
    app.querySelector('[data-action="back"]').addEventListener('click', () => api.back());
    app.querySelector('[data-action="forward"]').addEventListener('click', () => api.forward());
    app.querySelector('[data-action="reload"]').addEventListener('click', () => api.reload());
    app.querySelector('[data-action="open-file"]').addEventListener('click', () => {
      api.openLocalFile().catch((error) => {
        console.error(error);
      });
    });
    app.querySelectorAll('[data-mode]').forEach((button) => {
      button.addEventListener('click', () => api.setMode(button.dataset.mode));
    });
    app.querySelector('.url-form').addEventListener('submit', (event) => {
      event.preventDefault();
      api.navigate(new FormData(event.currentTarget).get('url'));
    });
  }

  function modeButton(mode, icon) {
    const active = state && state.mode === mode ? ' active' : '';
    const modeCopy = modeInfo(mode);
    return `
      <button class="mode${active}" data-mode="${mode}" title="${escapeAttribute(`${modeCopy.label}: ${modeCopy.help}`)}">
        <span class="mode-icon">${icon}</span>
        <span class="mode-copy">
          <strong>${escapeHtml(modeCopy.label)}</strong>
          <small>${escapeHtml(modeCopy.help)}</small>
        </span>
      </button>
    `;
  }

  function renderPanel() {
    const currentMode = modeInfo(state ? state.mode : 'preview');
    app.className = 'panel';
    app.innerHTML = `
      <section class="panel-header">
        <div class="panel-title">
          <div>
            <h1>${escapeHtml(copy.panel.title)}</h1>
            <p>${escapeHtml(copy.panel.subtitle)}</p>
          </div>
          <div class="status-pill">${escapeHtml(currentMode.label)}</div>
        </div>
        <div class="state-grid">
          ${stat(copy.panel.session, state ? state.sessionId : '')}
          ${stat(copy.panel.events, state ? String(state.eventCount) : '0')}
          ${stat(copy.panel.agentPort, endpointText().replace(/^https?:\/\//, ''))}
          ${stat(copy.panel.latency, latencyText())}
        </div>
      </section>
      <section class="instructions">
        <div class="section-title">
          <div>
            <h2>${escapeHtml(copy.instructions.title)}</h2>
            <p>${escapeHtml(copy.instructions.subtitle)}</p>
          </div>
        </div>
        <div class="instruction-list">
          ${copy.instructions.items.map(renderInstruction).join('')}
        </div>
      </section>
      <section class="events">
        ${events.length ? events.map(renderEvent).join('') : `<div class="empty">${escapeHtml(copy.panel.empty)}</div>`}
      </section>
    `;
  }

  function renderInstruction(item) {
    return `
      <article class="instruction ${escapeAttribute(item.tone || '')}">
        <div class="instruction-mark">${escapeHtml(item.mark)}</div>
        <div>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.body)}</p>
        </div>
      </article>
    `;
  }

  function stat(label, value) {
    return `<div class="stat"><div class="stat-label">${escapeHtml(label)}</div><div class="stat-value" title="${escapeAttribute(value || '')}">${escapeHtml(value || '-')}</div></div>`;
  }

  function renderEvent(event) {
    const target = event.target && (event.target.cssSelector || event.target.xpath || event.target.tagName) || copy.panel.unknownTarget;
    return `
      <article class="event-card">
        <div class="event-head">
          <div class="event-action">${escapeHtml(event.action || 'diff')}</div>
          <div class="event-seq">#${event.sequence}</div>
        </div>
        <div class="event-target">${escapeHtml(target)}</div>
        <pre class="event-pre">${escapeHtml(JSON.stringify(event, null, 2))}</pre>
      </article>
    `;
  }

  function endpointText() {
    return state && state.endpoint ? state.endpoint.httpUrl : copy.panel.agentPortStarting;
  }

  function latencyText() {
    const switches = state && state.metrics ? state.metrics.modeSwitches : [];
    if (!switches || !switches.length) {
      return '-';
    }
    const last = switches[switches.length - 1];
    return `${last.latencyMs} ms`;
  }

  function modeInfo(mode) {
    return copy.modes[mode] || copy.modes.preview;
  }

  function languageCopy() {
    if (prefersChinese()) {
      return {
        chromeTitle: '灵犀页镜',
        appName: '灵犀页镜',
        appCaption: '页面编辑与 Diff 采集',
        modesLabel: '遮罩模式',
        nav: {
          back: '返回',
          backHelp: '回到上一个浏览历史页面',
          forward: '前进',
          forwardHelp: '前往下一个浏览历史页面',
          reload: '刷新',
          reloadHelp: '重新加载当前目标页面',
          openFile: '本地文件',
          openFileHelp: '从本机选择 HTML 文件打开',
          go: '打开',
          goHelp: '加载地址栏中的 URL 或本地文件路径'
        },
        url: {
          aria: '目标页面地址',
          placeholder: '输入 URL 或本地文件路径'
        },
        modes: {
          preview: {
            label: '预览',
            help: '正常浏览，不拦截页面点击'
          },
          'quick-edit': {
            label: '快捷编辑',
            help: '选中、双击修改、拖拽布局'
          },
          annotation: {
            label: '批注',
            help: '点击任意区域钉反馈气泡'
          }
        },
        panel: {
          title: '差异负载',
          subtitle: 'Agent 会实时读取这些结构化操作',
          session: '会话',
          events: '事件',
          agentPort: 'Agent 通信端口',
          agentPortShort: '通信端口',
          agentPortHelp: 'Agent 通过这个本地接口读取用户操作、切换模式和获取差异负载。',
          latency: '切换延迟',
          agentPortStarting: '通信接口启动中',
          empty: '还没有捕获到用户 Diff。切到快捷编辑或批注模式后在页面上操作。',
          unknownTarget: '未知目标'
        },
        instructions: {
          title: '操作说明',
          subtitle: '用户操作会立刻变成右侧的 payload',
          items: [
            { mark: '1', tone: 'cyan', title: '选择模式', body: '顶部三个大按钮可瞬时切换预览、快捷编辑、批注，不刷新页面。' },
            { mark: '2', tone: 'green', title: '快捷编辑', body: '单击选中组件；双击文字或图片可改内容；拖拽组件会记录 transform 差异。' },
            { mark: '3', tone: 'amber', title: '批注反馈', body: '点击页面任意区域，输入修改意见，按提交或 Ctrl/⌘+Enter 固定批注。' },
            { mark: '4', tone: 'blue', title: 'Agent 读取', body: '右侧事件流与 CLI/本地接口保持同步，Agent 可读取 DOM 路径、坐标和变更内容。' }
          ]
        }
      };
    }
    return {
      chromeTitle: 'Intent Browser',
      appName: 'Intent Browser',
      appCaption: 'Page editing and diff capture',
      modesLabel: 'Overlay modes',
      nav: {
        back: 'Back',
        backHelp: 'Go to the previous page in the target history',
        forward: 'Forward',
        forwardHelp: 'Go to the next page in the target history',
        reload: 'Reload',
        reloadHelp: 'Reload the current target page',
        openFile: 'File',
        openFileHelp: 'Choose a local HTML file from this computer',
        go: 'Open',
        goHelp: 'Load the URL or local file path in the address bar'
      },
      url: {
        aria: 'Target page address',
        placeholder: 'Enter a URL or local file path'
      },
      modes: {
        preview: {
          label: 'Preview',
          help: 'Browse normally, no click interception'
        },
        'quick-edit': {
          label: 'Quick Edit',
          help: 'Select, double-click edit, drag layout'
        },
        annotation: {
          label: 'Annotation',
          help: 'Click anywhere to pin feedback'
        }
      },
      panel: {
        title: 'Diff Payloads',
        subtitle: 'Structured operations are ready for the agent',
        session: 'Session',
        events: 'Events',
        agentPort: 'Agent API',
        agentPortShort: 'Agent API',
        agentPortHelp: 'The agent uses this local API to read interactions, switch modes, and fetch diff payloads.',
        latency: 'Latency',
        agentPortStarting: 'API starting',
        empty: 'No user diffs captured yet. Switch to Quick Edit or Annotation and interact with the page.',
        unknownTarget: 'Unknown target'
      },
      instructions: {
        title: 'How To Use',
        subtitle: 'Every user operation becomes a live payload here',
        items: [
          { mark: '1', tone: 'cyan', title: 'Choose a mode', body: 'Use the three large top buttons to switch Preview, Quick Edit, and Annotation without refreshing.' },
          { mark: '2', tone: 'green', title: 'Quick edit', body: 'Click to select; double-click text or images to change content; drag elements to record transform diffs.' },
          { mark: '3', tone: 'amber', title: 'Pin feedback', body: 'Click any page region, type feedback, then submit or press Ctrl/⌘+Enter to save the note.' },
          { mark: '4', tone: 'blue', title: 'Agent reads', body: 'The event stream mirrors CLI/API output with DOM paths, coordinates, and concrete changes.' }
        ]
      }
    };
  }

  function prefersChinese() {
    const languages = [
      navigator.language,
      ...Array.from(navigator.languages || [])
    ].filter(Boolean);
    return languages.some((value) => String(value).toLowerCase().startsWith('zh'));
  }

  function escapeHtml(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replaceAll('\n', ' ');
  }

  api.onState((nextState) => {
    state = nextState;
    render();
  });
  api.onEvent((event) => {
    events.unshift(event);
    if (events.length > 50) {
      events.pop();
    }
    render();
  });
  api.onMetric(() => render());
  api.getState().then((nextState) => {
    state = nextState;
    render();
  });
  render();
})();
