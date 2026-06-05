(() => {
  const LABELS = {
    safe:  { text: 'Safe',  className: 'acb-label--safe'  },
    toxic: { text: 'Toxic', className: 'acb-label--toxic' }
  };

  const BODY_SELECTORS = ['div[slot="comment"]', 'div[data-testid="comment"]', 'div[data-test-id="comment"]', '.md'];

  // Place badge as a DOM sibling BEFORE the comment element so it is
  // completely outside shreddit-comment's shadow DOM and never blurred.
  const ensureBadge = (commentNode) => {
    if (commentNode._acbBadge && commentNode._acbBadge.isConnected) {
      return commentNode._acbBadge;
    }
    const badge = document.createElement('div');
    badge.className = 'acb-label';
    commentNode.insertAdjacentElement('beforebegin', badge);
    commentNode._acbBadge = badge;
    return badge;
  };

  const findBodyNode = (commentNode) => {
    for (const selector of BODY_SELECTORS) {
      const match = commentNode.querySelector(selector);
      if (match) return match;
    }
    return commentNode;
  };

  // Overlay sits INSIDE the body node as a sibling of the blurred children.
  // Because filter:blur only affects an element's own subtree, the overlay
  // (a sibling, not a child of any blurred element) is always sharp.
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
    const overlay = bodyNode.querySelector(':scope > .acb-reveal-overlay');
    if (overlay) overlay.remove();
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

    if (normalized === 'safe') {
      clearBlur(commentNode);
    } else {
      applyBlur(commentNode);
    }
  };

  window.commentHighlighter = { applyLabel };
})();
