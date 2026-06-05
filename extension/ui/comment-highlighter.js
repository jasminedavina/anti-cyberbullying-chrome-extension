(() => {
  const LABELS = {
    safe: { text: 'Safe', className: 'acb-label--safe' },
    warning: { text: 'Warning', className: 'acb-label--warning' },
    toxic: { text: 'Toxic', className: 'acb-label--toxic' }
  };
  const BODY_SELECTORS = ['div[slot="comment"]', 'div[data-testid="comment"]', 'div[data-test-id="comment"]', '.md'];

  const ensureBadge = (commentNode) => {
    let badge = commentNode.querySelector('.acb-label');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'acb-label';
      commentNode.prepend(badge);
    }
    return badge;
  };

  const findBodyNode = (commentNode) => {
    for (const selector of BODY_SELECTORS) {
      const match = commentNode.querySelector(selector);
      if (match) return match;
    }
    return commentNode;
  };

  const ensureRevealButton = (commentNode, bodyNode) => {
    let button = commentNode.querySelector('.acb-reveal');
    if (button) return button;

    button = document.createElement('button');
    button.type = 'button';
    button.className = 'acb-reveal';
    button.textContent = 'Click to reveal';
    button.addEventListener('click', () => {
      bodyNode.classList.remove('acb-comment-body--blurred');
      commentNode.classList.add('acb-comment--revealed');
      button.remove();
    });

    const badge = ensureBadge(commentNode);
    badge.insertAdjacentElement('afterend', button);
    return button;
  };

  const applyBlur = (commentNode) => {
    if (commentNode.classList.contains('acb-comment--revealed')) return;
    const bodyNode = findBodyNode(commentNode);
    // Only add blur class to a child body node, not the comment root itself.
    // When bodyNode === commentNode (shreddit-comment fallback), blur is handled
    // via CSS targeting <p> tags so the reveal button stays unblurred.
    if (bodyNode !== commentNode) {
      bodyNode.classList.add('acb-comment-body--blurred');
    }
    ensureRevealButton(commentNode, bodyNode);
  };

  const clearBlur = (commentNode) => {
    const bodyNode = findBodyNode(commentNode);
    bodyNode.classList.remove('acb-comment-body--blurred');
    const button = commentNode.querySelector('.acb-reveal');
    if (button) button.remove();
  };

  const applyLabel = (commentNode, label) => {
    if (!commentNode) return;
    const normalized = LABELS[label] ? label : 'warning';
    const badge = ensureBadge(commentNode);
    const { text, className } = LABELS[normalized];

    badge.textContent = text;
    badge.classList.remove('acb-label--safe', 'acb-label--warning', 'acb-label--toxic');
    badge.classList.add(className);

    commentNode.classList.add('acb-comment');
    commentNode.classList.remove('acb-comment--safe', 'acb-comment--warning', 'acb-comment--toxic');
    commentNode.classList.add(`acb-comment--${normalized}`);

    if (normalized === 'safe') {
      clearBlur(commentNode);
    } else {
      applyBlur(commentNode);
    }
  };

  window.commentHighlighter = {
    applyLabel
  };
})();
