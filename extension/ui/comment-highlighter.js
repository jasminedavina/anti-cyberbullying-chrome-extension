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

  const findBodyNode = (commentNode) => {
    for (const sel of BODY_SELECTORS) {
      const m = commentNode.querySelector(sel);
      if (m) return m;
    }
    return commentNode;
  };

  // Badge is prepended INSIDE the comment's body slot (div[slot="comment"]).
  // This scopes it to the exact comment element and prevents it from appearing
  // inside a parent comment's rendered area (which happened with beforebegin).
  // The blur CSS and the overlay both exclude .acb-label, so it stays visible.
  const ensureBadge = (commentNode) => {
    if (commentNode._acbBadge?.isConnected) return commentNode._acbBadge;

    if (!commentNode.dataset.acbId) {
      commentNode.dataset.acbId = 'acb' + Math.random().toString(36).slice(2, 9);
    }
    const id      = commentNode.dataset.acbId;
    const body    = findBodyNode(commentNode);

    const existing = body.querySelector(`:scope > .acb-label[data-acb-for="${id}"]`);
    if (existing) {
      commentNode._acbBadge = existing;
      return existing;
    }

    const badge = document.createElement('div');
    badge.className = 'acb-label';
    badge.dataset.acbFor = id;
    body.prepend(badge);
    commentNode._acbBadge = badge;
    return badge;
  };

  // Overlay sits INSIDE bodyNode, after the badge, covering only the blurred text.
  // z-index is lower than the badge, so the badge remains visible on top.
  const ensureOverlay = (bodyNode, commentNode) => {
    if (bodyNode.querySelector(':scope > .acb-reveal-overlay')) return;

    const overlay = document.createElement('div');
    overlay.className = 'acb-reveal-overlay';
    const span = document.createElement('span');
    span.className = 'acb-reveal-text';
    span.textContent = 'Tap to reveal';
    overlay.appendChild(span);

    overlay.addEventListener('click', () => {
      bodyNode.classList.remove('acb-comment-body--blurred');
      commentNode.classList.add('acb-comment--revealed');
      overlay.remove();
      buildRephrasedPanel(bodyNode);
    });

    bodyNode.appendChild(overlay);
  };

  const buildRephrasedPanel = (bodyNode) => {
    const originalText = bodyNode.innerText.trim();
    const rephrased    = window.detoxRewriter?.rephrase(originalText) ?? originalText;

    // Children to hide/show — exclude badge and the rephrased panel itself
    const origChildren = Array.from(bodyNode.children).filter(
      el => !el.classList.contains('acb-rephrased') && !el.classList.contains('acb-label')
    );

    if (!rephrased || rephrased === originalText) {
      window.detoxRewriter?.highlightInNode(bodyNode);
      return;
    }

    origChildren.forEach(el => (el.style.display = 'none'));

    const panel       = document.createElement('div');
    panel.className   = 'acb-rephrased';

    const header      = document.createElement('div');
    header.className  = 'acb-rephrased__header';

    const titleEl     = document.createElement('span');
    titleEl.className = 'acb-rephrased__title';
    titleEl.textContent = '📖 Rephrased for easier reading';

    const toggleBtn   = document.createElement('button');
    toggleBtn.type    = 'button';
    toggleBtn.className = 'acb-rephrased__toggle';
    toggleBtn.textContent = 'See original';

    const rephrasedBody   = document.createElement('div');
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
