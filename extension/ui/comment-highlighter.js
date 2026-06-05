(() => {
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

  // Overlay sits INSIDE bodyNode, covering only the blurred text.
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

  const buildRephrasedPanel = async (bodyNode) => {
    const originalText = bodyNode.innerText.trim();

    // Show spinner while Gemini (or lexicon fallback) processes the text
    const loader = document.createElement('div');
    loader.className = 'acb-rephrased acb-rephrased--loading';
    loader.textContent = 'Rephrasing…';
    bodyNode.appendChild(loader);

    const rephrased = await (window.detoxRewriter?.rephraseAsync(originalText)
      ?? Promise.resolve(originalText));

    loader.remove();

    const origChildren = Array.from(bodyNode.children).filter(
      el => !el.classList.contains('acb-rephrased')
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
    titleEl.textContent = 'Rephrased for easier reading';

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

  // Label is rendered purely via CSS ::before on the comment node itself —
  // completely outside the blurred body slot, always visible.
  const applyLabel = (commentNode, label) => {
    if (!commentNode) return;
    const normalized = (label === 'toxic') ? 'toxic' : 'safe';

    commentNode.classList.add('acb-comment');
    commentNode.classList.remove('acb-comment--safe', 'acb-comment--toxic');
    commentNode.classList.add(`acb-comment--${normalized}`);
    // ::before uses content: attr(data-acb-label) to show the pill text
    commentNode.dataset.acbLabel = normalized === 'toxic' ? 'Toxic' : 'Safe';

    if (normalized === 'safe') clearBlur(commentNode);
    else applyBlur(commentNode);
  };

  window.commentHighlighter = { applyLabel };
})();
