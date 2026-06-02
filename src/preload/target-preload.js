const { ipcRenderer } = require('electron');

(function () {
  const VALID_MODES = new Set(['preview', 'quick-edit', 'annotation']);
  const MAX_Z_INDEX = 2147483647;
  const copy = languageCopy();
  const state = {
    mode: 'preview',
    hoverEl: null,
    selectedEl: null,
    editState: null,
    drag: null,
    annotations: [],
    sequence: 0,
    lastPoint: { x: 0, y: 0 }
  };

  let host = null;
  let root = null;
  let hoverRect = null;
  let selectedRect = null;
  let badge = null;
  let popover = null;
  let pinLayer = null;
  let raf = 0;

  function init() {
    ensureOverlay();
    window.addEventListener('scroll', scheduleRender, true);
    window.addEventListener('resize', scheduleRender, true);
    document.addEventListener('pointermove', onPointerMove, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointerup', onPointerUp, true);
    document.addEventListener('pointercancel', onPointerUp, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('dblclick', onDoubleClick, true);
    document.addEventListener('keydown', onKeyDown, true);

    ipcRenderer.on('adb:set-mode', (_event, message) => {
      if (typeof message === 'string') {
        setMode(message, Date.now());
      } else {
        setMode(message.mode, message.requestedAt);
      }
    });

    ipcRenderer.send('adb:target:ready', getPageInfo());
  }

  function ensureOverlay() {
    if (host && document.documentElement.contains(host)) {
      return;
    }
    host = document.createElement('intent-browser-overlay');
    host.setAttribute('data-intent-browser', 'overlay');
    Object.assign(host.style, {
      position: 'fixed',
      inset: '0',
      width: '100vw',
      height: '100vh',
      zIndex: String(MAX_Z_INDEX),
      pointerEvents: 'none',
      contain: 'layout style paint',
      colorScheme: 'dark'
    });
    root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `
      <style>
        :host, * { box-sizing: border-box; }
        .rect {
          position: fixed;
          pointer-events: none;
          border: 2px solid #28d3a6;
          background: rgba(40, 211, 166, 0.08);
          box-shadow: 0 0 0 1px rgba(17, 20, 24, 0.65), 0 10px 35px rgba(0, 0, 0, 0.18);
          display: none;
        }
        .hover { border-color: #6aa9ff; background: rgba(106, 169, 255, 0.08); }
        .badge {
          position: fixed;
          left: 12px;
          bottom: 12px;
          min-width: 0;
          max-width: 360px;
          padding: 8px 10px;
          border-radius: 8px;
          border: 1px solid rgba(40, 211, 166, 0.7);
          background: rgba(13, 18, 23, 0.92);
          color: #dffbf5;
          font: 12px/1.3 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          pointer-events: none;
          display: none;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .popover {
          position: fixed;
          width: 286px;
          max-height: min(440px, calc(100vh - 24px));
          overflow: auto;
          border: 1px solid #323a43;
          border-radius: 8px;
          background: #11161b;
          color: #e9edf1;
          box-shadow: 0 18px 50px rgba(0, 0, 0, 0.35);
          font: 12px/1.4 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          pointer-events: auto;
          display: none;
        }
        .popover header {
          padding: 9px 10px;
          border-bottom: 1px solid #323a43;
          color: #9aa5b1;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }
        .section { padding: 10px; display: grid; gap: 8px; border-bottom: 1px solid #252c34; }
        .section:last-child { border-bottom: 0; }
        .row { display: grid; grid-template-columns: 84px 1fr; gap: 8px; align-items: center; }
        label { color: #9aa5b1; }
        input, textarea, button {
          font: inherit;
          border: 1px solid #323a43;
          border-radius: 7px;
          background: #0c0f12;
          color: #e9edf1;
          outline: none;
        }
        input { height: 30px; padding: 0 8px; min-width: 0; }
        textarea { width: 100%; min-height: 88px; padding: 8px; resize: vertical; }
        input:focus, textarea:focus { border-color: #6aa9ff; }
        button {
          min-height: 31px;
          padding: 0 10px;
          cursor: pointer;
          background: #20262d;
        }
        button.primary { border-color: rgba(40, 211, 166, 0.8); background: rgba(40, 211, 166, 0.16); color: #dffbf5; }
        .hint { color: #9aa5b1; font-size: 11px; }
        .pins { position: fixed; inset: 0; pointer-events: none; }
        .pin {
          position: fixed;
          min-width: 24px;
          min-height: 24px;
          pointer-events: auto;
        }
        .pin-dot {
          width: 24px;
          height: 24px;
          display: grid;
          place-items: center;
          border-radius: 999px;
          border: 1px solid rgba(246, 200, 95, 0.9);
          background: #2a2110;
          color: #f6c85f;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.32);
          font: 700 12px/1 ui-sans-serif, system-ui, sans-serif;
          transform: translate(-50%, -100%);
        }
        .annotation {
          position: fixed;
          left: 12px;
          top: 12px;
          width: 286px;
          max-width: calc(100vw - 24px);
          max-height: min(440px, calc(100vh - 24px));
          overflow: auto;
          border: 1px solid #3d4651;
          border-radius: 8px;
          background: #11161b;
          color: #e9edf1;
          box-shadow: 0 18px 50px rgba(0, 0, 0, 0.36);
          padding: 10px;
          display: grid;
          gap: 8px;
          font: 12px/1.4 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .annotation-actions { display: flex; gap: 8px; justify-content: flex-end; }
        .annotation-text {
          max-width: 260px;
          color: #f4d78a;
          background: #19160e;
          border: 1px solid rgba(246, 200, 95, 0.35);
          border-radius: 8px;
          padding: 8px;
          font: 12px/1.4 ui-sans-serif, system-ui, sans-serif;
        }
      </style>
      <div class="rect hover"></div>
      <div class="rect selected"></div>
      <div class="badge"></div>
      <div class="pins"></div>
      <div class="popover"></div>
    `;
    hoverRect = root.querySelector('.hover');
    selectedRect = root.querySelector('.selected');
    badge = root.querySelector('.badge');
    pinLayer = root.querySelector('.pins');
    popover = root.querySelector('.popover');
    document.documentElement.appendChild(host);
  }

  function setMode(nextMode, requestedAt) {
    if (!VALID_MODES.has(nextMode)) {
      return;
    }
    if (state.mode === 'quick-edit' && nextMode !== 'quick-edit') {
      finishTextEdit(false);
      state.selectedEl = null;
      hidePopover();
    }
    state.mode = nextMode;
    document.documentElement.setAttribute('data-intent-browser-mode', nextMode);
    badge.style.display = nextMode === 'preview' ? 'none' : 'block';
    badge.textContent = nextMode === 'quick-edit'
      ? copy.badge.quickEdit
      : nextMode === 'annotation'
        ? copy.badge.annotation
        : '';
    if (nextMode === 'preview') {
      hideRects();
      hidePopover();
    }
    scheduleRender();
    ipcRenderer.send('adb:target:mode-applied', {
      mode: nextMode,
      requestedAt,
      latencyMs: Number.isFinite(requestedAt) ? Math.max(0, Date.now() - requestedAt) : 0
    });
  }

  function onPointerMove(event) {
    state.lastPoint = { x: event.clientX, y: event.clientY };
    if (isOverlayEvent(event) || state.mode === 'preview') {
      return;
    }
    if (state.drag) {
      updateDrag(event);
      return;
    }
    const target = eventTarget(event);
    if (!target) {
      return;
    }
    state.hoverEl = target;
    scheduleRender();
  }

  function onPointerDown(event) {
    if (state.mode !== 'quick-edit' || isOverlayEvent(event) || event.button !== 0) {
      return;
    }
    const target = eventTarget(event);
    if (!target) {
      return;
    }
    state.drag = {
      target,
      started: false,
      startX: event.clientX,
      startY: event.clientY,
      beforeTransform: target.style.transform || '',
      beforePosition: target.style.position || '',
      pointerType: event.pointerType || 'mouse'
    };
  }

  function updateDrag(event) {
    const drag = state.drag;
    if (!drag) {
      return;
    }
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.started && Math.hypot(dx, dy) < 6) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    drag.started = true;
    selectElement(drag.target);
    drag.target.style.transform = composeTransform(drag.beforeTransform, dx, dy);
    drag.target.style.willChange = 'transform';
    scheduleRender();
  }

  function onPointerUp(event) {
    if (!state.drag) {
      return;
    }
    const drag = state.drag;
    state.drag = null;
    if (!drag.started) {
      return;
    }
    const afterTransform = drag.target.style.transform || '';
    drag.target.style.willChange = '';
    emitDiff('style.update', drag.target, {
      property: 'transform',
      before: drag.beforeTransform,
      after: afterTransform,
      delta: {
        x: round(event.clientX - drag.startX),
        y: round(event.clientY - drag.startY)
      }
    }, event, { gesture: 'drag' });
  }

  function onClick(event) {
    if (isOverlayEvent(event) || state.mode === 'preview') {
      return;
    }
    const target = eventTarget(event);
    if (!target) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (state.mode === 'annotation') {
      createAnnotation(target, event);
      return;
    }
    if (state.mode === 'quick-edit') {
      selectElement(target);
    }
  }

  function onDoubleClick(event) {
    if (state.mode !== 'quick-edit' || isOverlayEvent(event)) {
      return;
    }
    const target = eventTarget(event);
    if (!target) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    beginQuickEdit(target, event);
  }

  function onKeyDown(event) {
    if (state.mode === 'preview') {
      return;
    }
    if (isOverlayEvent(event)) {
      return;
    }
    if (event.key === 'Escape') {
      if (state.editState) {
        finishTextEdit(true);
      }
      state.selectedEl = null;
      hidePopover();
      scheduleRender();
    }
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      finishTextEdit(false);
    }
  }

  function beginQuickEdit(target, event) {
    const editable = resolveEditableTarget(target);
    selectElement(editable);
    if (isImageLike(editable)) {
      showPopover(editable, 'media');
      const input = popover.querySelector('[data-media-src]');
      if (input) {
        input.focus();
        input.select();
      }
      return;
    }
    if (isFormTextField(editable)) {
      editFormValue(editable, event);
      return;
    }
    if (isTextCandidate(editable)) {
      editPlainText(editable, event);
    }
  }

  function editFormValue(element, event) {
    const before = element.value;
    const finish = () => {
      element.removeEventListener('blur', finish, true);
      element.removeEventListener('change', finish, true);
      if (element.value !== before) {
        emitDiff('value.replace', element, { before, after: element.value }, event, { field: element.tagName.toLowerCase() });
      }
    };
    element.focus();
    element.select && element.select();
    element.addEventListener('blur', finish, true);
    element.addEventListener('change', finish, true);
  }

  function editPlainText(element, event) {
    finishTextEdit(false);
    const before = element.innerText;
    state.editState = {
      element,
      before,
      event,
      contentEditable: element.getAttribute('contenteditable'),
      spellcheck: element.getAttribute('spellcheck')
    };
    element.setAttribute('contenteditable', 'plaintext-only');
    element.setAttribute('spellcheck', 'false');
    element.focus({ preventScroll: true });
    selectElementContents(element);
    element.addEventListener('blur', onEditableBlur, true);
    showPopover(element, 'text');
  }

  function onEditableBlur() {
    finishTextEdit(false);
  }

  function finishTextEdit(revert) {
    const edit = state.editState;
    if (!edit) {
      return;
    }
    edit.element.removeEventListener('blur', onEditableBlur, true);
    const after = edit.element.innerText;
    if (revert) {
      edit.element.innerText = edit.before;
    }
    if (edit.contentEditable === null) {
      edit.element.removeAttribute('contenteditable');
    } else {
      edit.element.setAttribute('contenteditable', edit.contentEditable);
    }
    if (edit.spellcheck === null) {
      edit.element.removeAttribute('spellcheck');
    } else {
      edit.element.setAttribute('spellcheck', edit.spellcheck);
    }
    state.editState = null;
    if (!revert && after !== edit.before) {
      emitDiff('text.replace', edit.element, {
        before: edit.before,
        after
      }, edit.event, { editing: 'contenteditable.plaintext-only' });
    }
  }

  function selectElement(element) {
    if (!element || element === host) {
      return;
    }
    state.selectedEl = element;
    state.hoverEl = element;
    showPopover(element);
    scheduleRender();
  }

  function showPopover(element, focusKind) {
    if (!element || state.mode !== 'quick-edit') {
      hidePopover();
      return;
    }
    const descriptor = buildTargetDescriptor(element, state.lastPoint);
    const computed = window.getComputedStyle(element);
    const mediaSrc = getMediaSource(element);
    popover.innerHTML = `
      <header title="${escapeAttribute(descriptor.cssSelector || descriptor.xpath)}">${escapeHtml(descriptor.tagName)} ${escapeHtml(shortSelector(descriptor))}</header>
      ${mediaSrc !== null ? `
        <div class="section">
          <div class="row"><label>${escapeHtml(copy.popover.imageSrc)}</label><input data-media-src value="${escapeAttribute(mediaSrc)}"></div>
        </div>` : ''}
      <div class="section">
        <div class="row"><label>${escapeHtml(copy.popover.width)}</label><input data-style="width" data-unit="px" type="number" step="1" value="${numberValue(computed.width)}"></div>
        <div class="row"><label>${escapeHtml(copy.popover.marginTop)}</label><input data-style="marginTop" data-unit="px" type="number" step="1" value="${numberValue(computed.marginTop)}"></div>
        <div class="row"><label>${escapeHtml(copy.popover.marginLeft)}</label><input data-style="marginLeft" data-unit="px" type="number" step="1" value="${numberValue(computed.marginLeft)}"></div>
        <div class="row"><label>${escapeHtml(copy.popover.padding)}</label><input data-style="padding" data-unit="px" type="number" step="1" value="${numberValue(computed.paddingTop)}"></div>
        <div class="row"><label>${escapeHtml(copy.popover.fontSize)}</label><input data-style="fontSize" data-unit="px" type="number" step="1" value="${numberValue(computed.fontSize)}"></div>
        <div class="hint">${escapeHtml(copy.popover.hint)}</div>
      </div>
    `;
    for (const input of popover.querySelectorAll('[data-style]')) {
      input.addEventListener('input', () => updateStyleFromInput(element, input));
      input.addEventListener('change', () => updateStyleFromInput(element, input));
    }
    const srcInput = popover.querySelector('[data-media-src]');
    if (srcInput) {
      srcInput.addEventListener('change', () => updateMediaSource(element, srcInput.value));
      srcInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          updateMediaSource(element, srcInput.value);
          srcInput.blur();
        }
      });
    }
    popover.style.display = 'block';
    if (focusKind === 'media' && srcInput) {
      srcInput.focus();
    }
    positionPopover(element);
  }

  function hidePopover() {
    popover.style.display = 'none';
    popover.innerHTML = '';
  }

  function updateStyleFromInput(element, input) {
    if (!element || input.value === '') {
      return;
    }
    const property = input.dataset.style;
    const unit = input.dataset.unit || '';
    const before = element.style[property] || '';
    const after = `${Number(input.value)}${unit}`;
    if (before === after) {
      return;
    }
    element.style[property] = after;
    scheduleRender();
    emitDiff('style.update', element, {
      property,
      before,
      after
    }, null, { control: 'style-popover' });
  }

  function updateMediaSource(element, nextValue) {
    const before = getMediaSource(element);
    if (before === nextValue) {
      return;
    }
    if (element instanceof HTMLImageElement) {
      element.setAttribute('src', nextValue);
    } else {
      element.style.backgroundImage = `url("${String(nextValue).replaceAll('"', '\\"')}")`;
    }
    emitDiff('image.src.replace', element, {
      before,
      after: nextValue
    }, null, { control: 'media-popover' });
  }

  function createAnnotation(target, event) {
    const point = {
      pageX: event.clientX + window.scrollX,
      pageY: event.clientY + window.scrollY,
      viewportX: event.clientX,
      viewportY: event.clientY
    };
    const annotation = {
      id: `ann-${Date.now()}-${state.annotations.length + 1}`,
      target,
      targetDescriptor: buildTargetDescriptor(target, { x: event.clientX, y: event.clientY }),
      point,
      text: '',
      saved: false,
      event
    };
    state.annotations.push(annotation);
    renderAnnotations();
    const textarea = root.querySelector(`[data-annotation-id="${annotation.id}"] textarea`);
    if (textarea) {
      textarea.focus();
    }
  }

  function renderAnnotations() {
    pinLayer.innerHTML = state.annotations.map((annotation, index) => {
      const x = round(annotation.point.pageX - window.scrollX);
      const y = round(annotation.point.pageY - window.scrollY);
      if (annotation.saved) {
        return `
          <div class="pin" style="left:${x}px;top:${y}px" data-annotation-id="${annotation.id}">
            <div class="pin-dot">${index + 1}</div>
            <div class="annotation-text">${escapeHtml(annotation.text)}</div>
          </div>
        `;
      }
      return `
        <div class="pin" style="left:${x}px;top:${y}px" data-annotation-id="${annotation.id}">
          <div class="pin-dot">${index + 1}</div>
          <div class="annotation">
            <textarea placeholder="${escapeAttribute(copy.annotation.placeholder)}">${escapeHtml(annotation.text)}</textarea>
            <div class="annotation-actions">
              <button data-cancel>${escapeHtml(copy.annotation.cancel)}</button>
              <button class="primary" data-save>${escapeHtml(copy.annotation.pin)}</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    for (const node of pinLayer.querySelectorAll('[data-annotation-id]')) {
      const annotation = state.annotations.find((item) => item.id === node.dataset.annotationId);
      if (!annotation || annotation.saved) {
        continue;
      }
      const textarea = node.querySelector('textarea');
      const save = node.querySelector('[data-save]');
      const cancel = node.querySelector('[data-cancel]');
      positionAnnotationBubble(node, annotation);
      textarea.addEventListener('input', () => {
        annotation.text = textarea.value;
      });
      textarea.addEventListener('keydown', (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault();
          saveAnnotation(annotation);
        }
      });
      save.addEventListener('click', () => saveAnnotation(annotation));
      cancel.addEventListener('click', () => {
        state.annotations = state.annotations.filter((item) => item.id !== annotation.id);
        renderAnnotations();
      });
    }
  }

  function positionAnnotationBubble(pinNode, annotation) {
    const bubble = pinNode.querySelector('.annotation');
    if (!bubble) {
      return;
    }
    const margin = 12;
    const gap = 14;
    const x = round(annotation.point.pageX - window.scrollX);
    const y = round(annotation.point.pageY - window.scrollY);
    const maxWidth = Math.max(180, window.innerWidth - margin * 2);
    bubble.style.width = `${Math.min(286, maxWidth)}px`;

    const rect = bubble.getBoundingClientRect();
    const bubbleWidth = rect.width || Math.min(286, maxWidth);
    const bubbleHeight = rect.height || 140;
    const fitsRight = x + gap + bubbleWidth <= window.innerWidth - margin;
    const preferredLeft = fitsRight ? x + gap : x - bubbleWidth - gap;
    const maxLeft = Math.max(margin, window.innerWidth - bubbleWidth - margin);
    const left = clamp(preferredLeft, margin, maxLeft);

    const preferredTop = y - bubbleHeight - gap;
    const fallbackTop = y + gap;
    const maxTop = Math.max(margin, window.innerHeight - bubbleHeight - margin);
    const top = clamp(preferredTop >= margin ? preferredTop : fallbackTop, margin, maxTop);

    bubble.style.left = `${round(left)}px`;
    bubble.style.top = `${round(top)}px`;
  }

  function saveAnnotation(annotation) {
    annotation.text = String(annotation.text || '').trim();
    if (!annotation.text) {
      return;
    }
    annotation.saved = true;
    emitDiff('annotation.create', annotation.target, {
      text: annotation.text,
      annotationId: annotation.id,
      anchor: annotation.point
    }, annotation.event, { annotationId: annotation.id });
    renderAnnotations();
  }

  function scheduleRender() {
    if (raf) {
      return;
    }
    raf = requestAnimationFrame(() => {
      raf = 0;
      renderRects();
      renderAnnotations();
      if (state.selectedEl && popover.style.display !== 'none') {
        positionPopover(state.selectedEl);
      }
    });
  }

  function renderRects() {
    if (state.mode === 'preview') {
      hideRects();
      return;
    }
    drawRect(hoverRect, state.hoverEl);
    drawRect(selectedRect, state.selectedEl);
  }

  function hideRects() {
    hoverRect.style.display = 'none';
    selectedRect.style.display = 'none';
  }

  function drawRect(node, element) {
    if (!element || !isElementVisible(element)) {
      node.style.display = 'none';
      return;
    }
    const rect = element.getBoundingClientRect();
    Object.assign(node.style, {
      display: 'block',
      left: `${round(rect.left)}px`,
      top: `${round(rect.top)}px`,
      width: `${round(rect.width)}px`,
      height: `${round(rect.height)}px`
    });
  }

  function positionPopover(element) {
    const rect = element.getBoundingClientRect();
    const width = 286;
    const x = clamp(rect.left, 12, window.innerWidth - width - 12);
    const below = rect.bottom + 10;
    const y = below + 320 < window.innerHeight ? below : Math.max(12, rect.top - 10 - popover.offsetHeight);
    Object.assign(popover.style, {
      left: `${round(x)}px`,
      top: `${round(y)}px`
    });
  }

  function emitDiff(action, element, change, event, context) {
    const point = pointFromEvent(event) || pointFromElement(element) || {
      viewport: { ...state.lastPoint },
      page: {
        x: state.lastPoint.x + window.scrollX,
        y: state.lastPoint.y + window.scrollY
      }
    };
    ipcRenderer.send('adb:target:diff', {
      eventId: `target-${Date.now()}-${++state.sequence}`,
      timestamp: new Date().toISOString(),
      mode: state.mode,
      action,
      page: getPageInfo(),
      target: buildTargetDescriptor(element, point.viewport),
      change,
      interaction: {
        type: event ? event.type : 'programmatic',
        pointerType: event && event.pointerType || 'none',
        point,
        modifiers: event ? {
          alt: event.altKey,
          ctrl: event.ctrlKey,
          meta: event.metaKey,
          shift: event.shiftKey
        } : {},
        context: context || {}
      },
      provenance: {
        client: 'intent-browser',
        runtime: 'electron-isolated-preload',
        overlayMode: state.mode
      }
    });
  }

  function buildTargetDescriptor(element, point) {
    const rect = element.getBoundingClientRect();
    const rootNode = element.getRootNode();
    const cssSelector = buildCssSelector(element, rootNode);
    const shadow = rootNode instanceof ShadowRoot ? {
      hostSelector: buildCssSelector(rootNode.host, document),
      innerSelector: cssSelector
    } : null;
    return {
      tagName: element.tagName.toLowerCase(),
      cssSelector,
      xpath: rootNode === document ? buildXPath(element) : null,
      shadowPath: shadow,
      domPath: buildDomPath(element),
      attributes: usefulAttributes(element),
      textSample: textSample(element),
      source: detectComponentSource(element),
      rect: rectJson(rect),
      coordinates: {
        viewport: point ? { x: round(point.x), y: round(point.y) } : null,
        page: point ? { x: round(point.x + window.scrollX), y: round(point.y + window.scrollY) } : null,
        element: point ? {
          x: round(point.x - rect.left),
          y: round(point.y - rect.top),
          rx: rect.width ? round((point.x - rect.left) / rect.width) : 0,
          ry: rect.height ? round((point.y - rect.top) / rect.height) : 0
        } : null
      }
    };
  }

  function buildCssSelector(element, rootNode) {
    const rootScope = rootNode && rootNode.querySelectorAll ? rootNode : document;
    const tag = element.tagName.toLowerCase();
    if (element.id) {
      const selector = `#${cssEscape(element.id)}`;
      if (isUnique(selector, rootScope)) {
        return selector;
      }
    }
    for (const attr of ['data-testid', 'data-test', 'data-cy', 'data-qa', 'data-component', 'aria-label', 'name', 'role']) {
      const value = element.getAttribute(attr);
      if (!value) continue;
      const selector = `${tag}[${attr}="${escapeCssString(value)}"]`;
      if (isUnique(selector, rootScope)) {
        return selector;
      }
    }
    const classSelector = classSelectorFor(element);
    if (classSelector) {
      const selector = `${tag}${classSelector}`;
      if (isUnique(selector, rootScope)) {
        return selector;
      }
    }
    const parts = [];
    let node = element;
    while (node && node.nodeType === Node.ELEMENT_NODE && node !== document.documentElement) {
      const segment = segmentFor(node);
      parts.unshift(segment);
      const selector = parts.join(' > ');
      if (isUnique(selector, rootScope)) {
        return selector;
      }
      node = node.parentElement;
    }
    parts.unshift('html');
    return parts.join(' > ');
  }

  function segmentFor(element) {
    const tag = element.tagName.toLowerCase();
    if (element.id) {
      return `${tag}#${cssEscape(element.id)}`;
    }
    const stable = ['data-testid', 'data-test', 'data-cy', 'data-qa', 'aria-label', 'name']
      .map((name) => [name, element.getAttribute(name)])
      .find(([, value]) => value);
    if (stable) {
      return `${tag}[${stable[0]}="${escapeCssString(stable[1])}"]`;
    }
    const classes = classSelectorFor(element);
    return `${tag}${classes || ''}:nth-of-type(${nthOfType(element)})`;
  }

  function classSelectorFor(element) {
    const classes = Array.from(element.classList || [])
      .filter((name) => /^[A-Za-z_-][A-Za-z0-9_-]*$/.test(name))
      .filter((name) => !name.startsWith('intent-browser'))
      .slice(0, 3);
    return classes.length ? `.${classes.map(cssEscape).join('.')}` : '';
  }

  function isUnique(selector, rootScope) {
    try {
      return rootScope.querySelectorAll(selector).length === 1;
    } catch (_error) {
      return false;
    }
  }

  function buildXPath(element) {
    const parts = [];
    let node = element;
    while (node && node.nodeType === Node.ELEMENT_NODE) {
      const tag = node.tagName.toLowerCase();
      const index = nthOfType(node);
      parts.unshift(`${tag}[${index}]`);
      node = node.parentElement;
    }
    return `/${parts.join('/')}`;
  }

  function buildDomPath(element) {
    const path = [];
    let node = element;
    while (node && node.nodeType === Node.ELEMENT_NODE) {
      path.unshift({
        tag: node.tagName.toLowerCase(),
        id: node.id || null,
        classes: Array.from(node.classList || []).slice(0, 5),
        nthOfType: nthOfType(node)
      });
      node = node.parentElement;
    }
    return path;
  }

  function detectComponentSource(element) {
    const attrs = sourceAttributes(element);
    const ancestor = attrs ? null : nearestAncestorSource(element);
    const react = detectReactSource(element);
    const vue = detectVueSource(element);
    return {
      explicit: attrs || (ancestor && ancestor.attributes) || null,
      explicitScope: attrs ? 'self' : ancestor ? 'ancestor' : null,
      explicitAncestor: ancestor,
      react,
      vue
    };
  }

  function sourceAttributes(element) {
    const attrs = {};
    for (const name of ['data-source', 'data-source-file', 'data-component', 'data-loc', 'data-line', 'data-column']) {
      const value = element.getAttribute && element.getAttribute(name);
      if (value) {
        attrs[name] = value;
      }
    }
    return Object.keys(attrs).length ? attrs : null;
  }

  function nearestAncestorSource(element) {
    let node = element.parentElement;
    let distance = 1;
    while (node && node !== document.body && distance < 12) {
      const attributes = sourceAttributes(node);
      if (attributes) {
        return {
          distance,
          tagName: node.tagName.toLowerCase(),
          cssSelector: buildCssSelector(node, node.getRootNode()),
          attributes
        };
      }
      node = node.parentElement;
      distance += 1;
    }
    return null;
  }

  function detectReactSource(element) {
    try {
      const key = Object.keys(element).find((item) => item.startsWith('__reactFiber$') || item.startsWith('__reactInternalInstance$'));
      let fiber = key ? element[key] : null;
      let depth = 0;
      while (fiber && depth < 20) {
        if (fiber._debugSource || fiber._debugOwner) {
          return {
            fileName: fiber._debugSource && fiber._debugSource.fileName || null,
            lineNumber: fiber._debugSource && fiber._debugSource.lineNumber || null,
            columnNumber: fiber._debugSource && fiber._debugSource.columnNumber || null,
            owner: fiber._debugOwner && componentName(fiber._debugOwner.type) || null,
            component: componentName(fiber.elementType || fiber.type)
          };
        }
        fiber = fiber.return;
        depth += 1;
      }
    } catch (_error) {
      return null;
    }
    return null;
  }

  function detectVueSource(element) {
    try {
      const component = element.__vueParentComponent;
      if (!component) {
        return null;
      }
      return {
        name: component.type && (component.type.name || component.type.__name) || null,
        file: component.type && component.type.__file || null
      };
    } catch (_error) {
      return null;
    }
  }

  function componentName(value) {
    return value && (value.displayName || value.name) || null;
  }

  function usefulAttributes(element) {
    const attrs = {};
    for (const attr of Array.from(element.attributes || [])) {
      if (
        attr.name === 'id' ||
        attr.name === 'class' ||
        attr.name.startsWith('data-') ||
        attr.name.startsWith('aria-') ||
        ['role', 'name', 'href', 'src', 'alt', 'title', 'type'].includes(attr.name)
      ) {
        attrs[attr.name] = attr.value.length > 240 ? `${attr.value.slice(0, 240)}...` : attr.value;
      }
    }
    return attrs;
  }

  function getPageInfo() {
    return {
      url: location.href,
      title: document.title,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        scrollX: round(window.scrollX),
        scrollY: round(window.scrollY),
        devicePixelRatio: window.devicePixelRatio
      },
      userAgent: navigator.userAgent
    };
  }

  function eventTarget(event) {
    const path = event.composedPath ? event.composedPath() : [];
    const candidate = path.find((node) => node instanceof Element && node !== host && !host.contains(node));
    if (candidate && candidate !== document.documentElement && candidate !== document.body) {
      return candidate;
    }
    let element = elementBelowOverlay(event.clientX, event.clientY);
    while (element && (element === host || host.contains(element))) {
      element = element.parentElement;
    }
    return element && element !== document.documentElement ? element : document.body;
  }

  function elementBelowOverlay(x, y) {
    let element = document.elementFromPoint(x, y);
    if (!host || element !== host && !host.contains(element)) {
      return element;
    }
    const previousDisplay = host.style.display;
    host.style.display = 'none';
    try {
      element = document.elementFromPoint(x, y);
    } finally {
      host.style.display = previousDisplay;
    }
    return element;
  }

  function isOverlayEvent(event) {
    if (!host || !event.composedPath || !event.composedPath().includes(host)) {
      return false;
    }
    const overlayElement = overlayElementFromPoint(event);
    return Boolean(overlayElement && overlayElement.closest('.annotation, .pin, .popover, input, textarea, button'));
  }

  function overlayElementFromPoint(event) {
    if (!root || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) {
      return null;
    }
    return root.elementFromPoint(event.clientX, event.clientY);
  }

  function resolveEditableTarget(element) {
    if (isImageLike(element) || isFormTextField(element) || isTextCandidate(element)) {
      return element;
    }
    const textChild = Array.from(element.querySelectorAll('p,h1,h2,h3,h4,h5,h6,span,a,button,label,li,strong,em,small'))
      .find(isTextCandidate);
    return textChild || element;
  }

  function isImageLike(element) {
    if (element instanceof HTMLImageElement) {
      return true;
    }
    return getBackgroundImageUrl(element) !== null;
  }

  function getMediaSource(element) {
    if (element instanceof HTMLImageElement) {
      return element.getAttribute('src') || element.currentSrc || '';
    }
    return getBackgroundImageUrl(element);
  }

  function getBackgroundImageUrl(element) {
    const value = window.getComputedStyle(element).backgroundImage;
    if (!value || value === 'none') {
      return null;
    }
    const match = value.match(/^url\(["']?(.*?)["']?\)$/);
    return match ? match[1] : null;
  }

  function isFormTextField(element) {
    return element instanceof HTMLTextAreaElement ||
      element instanceof HTMLInputElement && ['text', 'search', 'url', 'email', 'tel', 'password', 'number'].includes(element.type);
  }

  function isTextCandidate(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'HTML', 'BODY'].includes(element.tagName)) {
      return false;
    }
    const text = element.innerText || '';
    return text.trim().length > 0 && text.length < 4000;
  }

  function isElementVisible(element) {
    if (!element || !document.documentElement.contains(element)) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.right >= 0 && rect.top <= window.innerHeight && rect.left <= window.innerWidth;
  }

  function pointFromEvent(event) {
    if (!event || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) {
      return null;
    }
    return {
      viewport: { x: round(event.clientX), y: round(event.clientY) },
      page: { x: round(event.clientX + window.scrollX), y: round(event.clientY + window.scrollY) }
    };
  }

  function pointFromElement(element) {
    if (!element) {
      return null;
    }
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    return {
      viewport: { x: round(x), y: round(y) },
      page: { x: round(x + window.scrollX), y: round(y + window.scrollY) }
    };
  }

  function rectJson(rect) {
    return {
      x: round(rect.x),
      y: round(rect.y),
      top: round(rect.top),
      left: round(rect.left),
      right: round(rect.right),
      bottom: round(rect.bottom),
      width: round(rect.width),
      height: round(rect.height)
    };
  }

  function composeTransform(before, dx, dy) {
    const translate = `translate(${round(dx)}px, ${round(dy)}px)`;
    return before && before !== 'none' ? `${translate} ${before}` : translate;
  }

  function selectElementContents(element) {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function textSample(element) {
    const text = (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim();
    return text.length > 180 ? `${text.slice(0, 180)}...` : text;
  }

  function shortSelector(descriptor) {
    const value = descriptor.cssSelector || descriptor.xpath || '';
    return value.length > 70 ? `${value.slice(0, 70)}...` : value;
  }

  function numberValue(value) {
    const number = parseFloat(value);
    return Number.isFinite(number) ? String(Math.round(number)) : '';
  }

  function nthOfType(element) {
    let index = 1;
    let sibling = element.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === element.tagName) {
        index += 1;
      }
      sibling = sibling.previousElementSibling;
    }
    return index;
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(value);
    }
    return String(value).replace(/[^A-Za-z0-9_-]/g, (char) => `\\${char}`);
  }

  function escapeCssString(value) {
    return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
  }

  function languageCopy() {
    if (prefersChinese()) {
      return {
        badge: {
          quickEdit: '快捷编辑：单击选中，双击文字/图片，拖拽元素调整布局',
          annotation: '批注模式：点击任意组件或区域，钉上反馈气泡'
        },
        popover: {
          imageSrc: '图片链接',
          width: '宽度',
          marginTop: '上边距',
          marginLeft: '左边距',
          padding: '内边距',
          fontSize: '字号',
          hint: '这些样式控件会先生成临时 DOM Diff，等待 Agent 重写源码。'
        },
        annotation: {
          placeholder: '写下希望 Agent 精确修改的内容...',
          cancel: '取消',
          pin: '提交'
        }
      };
    }
    return {
      badge: {
        quickEdit: 'Quick Edit: click to select, double-click text/images, drag elements',
        annotation: 'Annotation: click any element or area to pin feedback'
      },
      popover: {
        imageSrc: 'image src',
        width: 'width',
        marginTop: 'margin top',
        marginLeft: 'margin left',
        padding: 'padding',
        fontSize: 'font size',
        hint: 'Style controls are temporary DOM diffs until the agent rewrites source.'
      },
      annotation: {
        placeholder: 'Describe the exact change for the agent...',
        cancel: 'Cancel',
        pin: 'Pin'
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

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function round(value) {
    return Math.round(Number(value) * 100) / 100;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
