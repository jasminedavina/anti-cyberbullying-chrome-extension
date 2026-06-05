(() => {
  const LABELS = {
    safe:  { text: 'Safe',  className: 'acb-label--safe'  },
    toxic: { text: 'Toxic', className: 'acb-label--toxic' }
  };

  const BODY_SELECTORS = [
    'div[slot="comment"]',
    'div[data-testid="comment"]',
    'div[data-test-id="comment"]',
    '.md'
  ];

  // Inserted BEFORE shreddit-comment so it is outside the shadow DOM
  // and can never be blurred.
  // Uses a stable data-acb-id link so calling this twice for the same node
  // always returns the same badge — never creates a duplicate.
  const ensureBadge = (commentNode) => {
    if (commentNode._acbBadge?.isConnected) return commentNode._acbBadge;

    // Assign a stable ID to the comment node on first visit
    if (!commentNode.dataset.acbId) {
      commentNode.dataset.acbId = 'acb' + Math.random().toString(36).slice(2, 9);
    }
    const id = commentNode.dataset.acbId;

    // Find an existing badge linked to this comment (handles duplicate calls)
    const existing = commentNode.parentElement
      ?.querySelector(`:scope > .acb-label[data-acb-for="${id}"]`);
    if (existing) {
      commentNode._acbBadge = existing;
      return existing;
    }

    const badge = document.createElement('div');
    badge.className = 'acb-label';
    badge.dataset.acbFor = id;
    commentNode.insertAdjacentElement('beforebegin', badge);
    commentNode._acbBadge = badge;
    return badge;
  };

  const findBodyNode = (commentNode) => {
    for (const sel of BODY_SELECTORS) {
      const m = commentNode.querySelector(sel);
      if (m) return m;
    }
    return commentNode;
  };

  // Build the rephrased panel and inject it inside bodyNode.
  // Original children are hidden; "See original" reveals them with highlights.
  const buildRephrasedPanel = (bodyNode) => {
    const originalText = bodyNode.innerText.trim();
    const rephrased    = window.detoxRewriter?.rephrase(originalText) ?? originalText;

    const origChildren = Array.from(bodyNode.children).filter(
      el => !el.classList.contains('acb-rephrased')
    );

    // If nothing changed, just highlight the original words
    if (!rephrased || rephrased === originalText) {
      window.detoxRewriter?.highlightInNode(bodyNode);
      return;
    }

    // Hide original content, show rephrased by default
    origChildren.forEach(el => (el.style.display = 'none'));

    const panel = document.createElement('div');
    panel.className = 'acb-rephrased';

    const header = document.createElement('div');
    header.className = 'acb-rephrased__header';

    const titleEl = document.createElement('span');
    titleEl.className = 'acb-rephrased__title';
    titleEl.textContent = '📖 Rephrased for easier reading';

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'acb-rephrased__toggle';
    toggleBtn.textContent = 'See original';

    const rephrasedBody = document.createElement('div');
    rephrasedBody.className = 'acb-rephrased__body';
    rephrasedBody.textContent = rephrased;

    let showingRephrased = true;
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showingRephrased = !showingRephrased;
      if (showingRephrased) {
        origChildren.forEach(el => (el.style.display = 'none'));
        rephrasedBody.style.display = '';
        toggleBtn.textContent = 'See original';
      } else {
        origChildren.forEach(el => (el.style.display = ''));
        rephrasedBody.style.display = 'none';
        toggleBtn.textContent = 'See rephrased';
        window.detoxRewriter?.highlightInNode(bodyNode);
      }
    });

    header.append(titleEl, toggleBtn);
    panel.append(header, rephrasedBody);
    bodyNode.appendChild(panel);
  };

  // Overlay sits inside bodyNode as a sibling of its children —
  // not a child of any blurred element — so it is never blurred.
  const ensureOverlay = (bodyNode, commentNode) => {
    if (bodyNode.querySelector(':scope > .acb-reveal-overlay')) return;

    const overlay = document.createElement('div');
    overlay.className = 'acb-reveal-overlay';

    const text = document.createElement('span');
    text.className = 'acb-reveal-text';
    text.textContent = 'Tap to reveal';
    overlay.appendChild(text);

    overlay.addEventListener('click', () => {
      bodyNode.classList.remove('acb-comment-body--blurred');
      commentNode.classList.add('acb-comment--revealed');
      overlay.remove();
      buildRephrasedPanel(bodyNode);
    });

    bodyNode.appendChild(overlay);
  };

  const applyBlur = (commentNode) => {
    if (commentNode.classList.contains('acb-comment--revealed')) return;
    const bodyNode = findBodyNode(commentNode);
    bodyNode.classList.add('acb-comment-body--blurred');
    ensureOverlay(bodyNode, commentNode);
  };

  const clearBlur = (commentNode) => {
    const bodyNode = findBodyNode(commentNode);
    bodyNode.classList.remove('acb-comment-body--blurred');
    bodyNode.querySelector(':scope > .acb-reveal-overlay')?.remove();
  };

  const applyLabel = (commentNode, label) => {
    if (!commentNode) return;
    const normalized = LABELS[label] ? label : 'safe';
    const badge = ensureBadge(commentNode);
    const { text, className } = LABELS[normalized];

    badge.textContent = text;
    badge.classList.remove('acb-label--safe', 'acb-label--toxic');
    badge.classList.add(className);

    commentNode.classList.add('acb-comment');
    commentNode.classList.remove('acb-comment--safe', 'acb-comment--toxic');
    commentNode.classList.add(`acb-comment--${normalized}`);

    if (normalized === 'safe') clearBlur(commentNode);
    else applyBlur(commentNode);
  };

  window.commentHighlighter = { applyLabel };
})();
