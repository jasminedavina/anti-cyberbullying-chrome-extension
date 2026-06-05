(() => {
  const modelClient = window.acbModelClient;

  if (!modelClient) {
    console.warn('Anti-cyberbullying: missing model client.');
    return;
  }

  const EDITOR_SELECTOR = [
    'textarea',
    '[contenteditable="true"]',
    'div[role="textbox"]',
    '[aria-multiline="true"]',
    '.public-DraftEditor-content[contenteditable="true"]',
    '[data-lexical-editor="true"]',
    'shreddit-composer',
    'comment-composer-host',
    'shreddit-composer textarea',
    'shreddit-composer [contenteditable="true"]'
  ].join(',');

  const MIN_TEXT_LENGTH = 3;
  const DEBOUNCE_MS = 550;
  const editorState = new WeakMap();

  document.documentElement.dataset.acbTypingPrevention = 'loaded';

  const getEditableFromEvent = (event) => {
    const path = event.composedPath ? event.composedPath() : [];
    const editor = path.find((node) => node instanceof Element && node.matches(EDITOR_SELECTOR));
    if (editor) return editor;

    if (document.activeElement && document.activeElement.matches(EDITOR_SELECTOR)) {
      return document.activeElement;
    }

    return event.target instanceof Element ? event.target.closest(EDITOR_SELECTOR) : null;
  };

  const isVisible = (element) =>
    Boolean(element.offsetWidth || element.offsetHeight || element.getClientRects().length);

  const isCommentEditor = (element) => {
    if (!element || !isVisible(element)) return false;

    if (element.matches('shreddit-composer, comment-composer-host')) return true;

    const redditComposer = element.closest(
      [
        'shreddit-composer',
        'comment-composer-host',
        'faceplate-form',
        '[data-testid*="comment"]',
        '[data-testid*="reply"]',
        '[slot*="comment"]',
        '[slot*="reply"]'
      ].join(',')
    );
    if (redditComposer) return true;

    const form = element.closest('form');
    const label = [
      element.getAttribute('aria-label'),
      element.getAttribute('placeholder'),
      element.getAttribute('name'),
      element.getAttribute('data-testid'),
      form && form.getAttribute('aria-label')
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return (
      /comment|reply|add a comment|what are your thoughts/.test(label) ||
      (location.hostname.includes('reddit.com') &&
        location.pathname.includes('/comments/') &&
        (element.matches('textarea, [contenteditable="true"], [role="textbox"], [aria-multiline="true"]')))
    );
  };

  const getEditorText = (editor) => {
    if ('value' in editor) return editor.value.trim();

    const shadowText = editor.shadowRoot && (
      editor.shadowRoot.querySelector('textarea') ||
      editor.shadowRoot.querySelector('[contenteditable="true"]') ||
      editor.shadowRoot.querySelector('[role="textbox"]')
    );
    if (shadowText) return getEditorText(shadowText);

    return (editor.innerText || editor.textContent || '').trim();
  };

  const setEditorText = (editor, text) => {
    const shadowEditor = editor.shadowRoot && (
      editor.shadowRoot.querySelector('textarea') ||
      editor.shadowRoot.querySelector('[contenteditable="true"]') ||
      editor.shadowRoot.querySelector('[role="textbox"]')
    );
    if (shadowEditor) {
      setEditorText(shadowEditor, text);
      return;
    }

    editor.focus();

    if ('value' in editor) {
      editor.value = text;
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      editor.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }

    const range = document.createRange();
    range.selectNodeContents(editor);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    document.execCommand('insertText', false, text);
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  };

  const getPanelAnchor = (editor) =>
    editor.closest(
      [
        'form',
        'shreddit-composer',
        'comment-composer-host',
        'faceplate-form',
        '[data-testid="comment-submission-form"]',
        '[data-testid*="comment"]',
        '[data-testid*="reply"]'
      ].join(',')
    ) || editor;

  const ensurePanel = (editor) => {
    const state = editorState.get(editor);
    if (state && state.panel && state.panel.isConnected) return state.panel;

    const anchor = getPanelAnchor(editor);
    let panel = anchor === editor
      ? editor.parentElement && editor.parentElement.querySelector(':scope > .acb-prevention-panel')
      : anchor.querySelector(':scope > .acb-prevention-panel');

    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'acb-prevention-panel acb-prevention-panel--idle';
      panel.setAttribute('role', 'status');
      panel.setAttribute('aria-live', 'polite');
      panel.innerHTML = `
        <div class="acb-prevention-panel__main">
          <strong class="acb-prevention-panel__title">Checking tone...</strong>
          <span class="acb-prevention-panel__score"></span>
        </div>
        <p class="acb-prevention-panel__message"></p>
        <div class="acb-prevention-panel__suggestion" hidden>
          <p class="acb-prevention-panel__rewrite"></p>
          <button type="button" class="acb-prevention-panel__apply">Use rewrite</button>
        </div>
      `;

      if (anchor === editor && editor.parentElement) {
        editor.insertAdjacentElement('afterend', panel);
      } else {
        anchor.append(panel);
      }
    }

    if (state) {
      state.panel = panel;
    }

    const applyButton = panel.querySelector('.acb-prevention-panel__apply');
    if (!applyButton.dataset.acbBound) {
      applyButton.dataset.acbBound = 'true';
      applyButton.addEventListener('click', () => {
        const state = editorState.get(editor);
        if (state && state.suggestion) {
          setEditorText(editor, state.suggestion);
          runPrediction(editor);
        }
      });
    }

    return panel;
  };

  const setPanelState = (editor, prediction, loading = false) => {
    const panel = ensurePanel(editor);
    const title = panel.querySelector('.acb-prevention-panel__title');
    const score = panel.querySelector('.acb-prevention-panel__score');
    const message = panel.querySelector('.acb-prevention-panel__message');
    const suggestionBox = panel.querySelector('.acb-prevention-panel__suggestion');
    const rewrite = panel.querySelector('.acb-prevention-panel__rewrite');

    panel.classList.remove(
      'acb-prevention-panel--idle',
      'acb-prevention-panel--safe',
      'acb-prevention-panel--warning',
      'acb-prevention-panel--toxic'
    );

    if (loading) {
      panel.classList.add('acb-prevention-panel--idle');
      title.textContent = 'Checking tone...';
      score.textContent = '';
      message.textContent = 'Analyzing your comment before you post.';
      suggestionBox.hidden = true;
      return;
    }

    const label = prediction.label || 'safe';
    const confidence = Math.round((prediction.score || 0) * 100);
    panel.classList.add(`acb-prevention-panel--${label}`);
    score.textContent = `${confidence}%`;

    if (label === 'toxic') {
      title.textContent = 'Toxic language detected';
      message.textContent = 'This comment may hurt someone. Consider rewriting it before posting.';
    } else if (label === 'warning') {
      title.textContent = 'Tone warning';
      message.textContent = 'This may read as aggressive. A calmer version could work better.';
    } else {
      title.textContent = 'Looks respectful';
      message.textContent = 'No bullying language detected in this draft.';
    }

    if (prediction.suggestion) {
      rewrite.textContent = prediction.suggestion;
      suggestionBox.hidden = false;
    } else {
      suggestionBox.hidden = true;
    }
  };

  const runPrediction = async (editor) => {
    const state = editorState.get(editor);
    if (!state) return;

    const text = getEditorText(editor);
    const requestId = state.requestId + 1;
    state.requestId = requestId;
    state.suggestion = '';

    if (text.length < MIN_TEXT_LENGTH) {
      const panel = ensurePanel(editor);
      panel.classList.remove(
        'acb-prevention-panel--safe',
        'acb-prevention-panel--warning',
        'acb-prevention-panel--toxic'
      );
      panel.classList.add('acb-prevention-panel--idle');
      panel.querySelector('.acb-prevention-panel__title').textContent = 'Start typing to check tone';
      panel.querySelector('.acb-prevention-panel__score').textContent = '';
      panel.querySelector('.acb-prevention-panel__message').textContent = 'Your warning and rewrite suggestion will appear here.';
      panel.querySelector('.acb-prevention-panel__suggestion').hidden = true;
      return;
    }

    setPanelState(editor, null, true);

    try {
      const prediction = await modelClient.predict(text);
      if (state.requestId !== requestId) return;
      state.suggestion = prediction.suggestion || '';
      setPanelState(editor, prediction);
    } catch (error) {
      if (state.requestId !== requestId) return;
      console.warn('Anti-cyberbullying: prediction failed.', error);
    }
  };

  const schedulePrediction = (editor) => {
    const state = editorState.get(editor);
    if (!state) return;

    clearTimeout(state.timerId);
    state.timerId = window.setTimeout(() => runPrediction(editor), DEBOUNCE_MS);
  };

  const attachEditor = (editor) => {
    if (editorState.has(editor) || !isCommentEditor(editor)) return;

    editorState.set(editor, {
      timerId: null,
      requestId: 0,
      panel: null,
      suggestion: ''
    });

    ensurePanel(editor);
    editor.addEventListener('input', () => schedulePrediction(editor));
    editor.addEventListener('focus', () => runPrediction(editor));
  };

  const scanEditors = (root = document) => {
    if (root.matches && root.matches(EDITOR_SELECTOR)) attachEditor(root);
    for (const editor of root.querySelectorAll(EDITOR_SELECTOR)) {
      attachEditor(editor);
    }

    for (const host of root.querySelectorAll('shreddit-composer, comment-composer-host')) {
      if (host.shadowRoot) scanEditors(host.shadowRoot);
    }
  };

  scanEditors(document);

  document.addEventListener(
    'focusin',
    (event) => {
      const editor = getEditableFromEvent(event);
      if (editor) {
        attachEditor(editor);
        runPrediction(editor);
      }
    },
    true
  );

  document.addEventListener(
    'input',
    (event) => {
      const editor = getEditableFromEvent(event);
      if (editor) {
        attachEditor(editor);
        schedulePrediction(editor);
      }
    },
    true
  );

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) scanEditors(node);
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
