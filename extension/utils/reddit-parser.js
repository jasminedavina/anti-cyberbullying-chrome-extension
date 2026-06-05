(() => {
  // New Reddit (shreddit) uses web components; old Reddit uses .md
  const COMMENT_SELECTORS = ['shreddit-comment', 'div[data-testid="comment"]', 'div[data-test-id="comment"]', '.md'];

  const getCommentNodes = (root = document) => {
    for (const selector of COMMENT_SELECTORS) {
      const nodes = Array.from(root.querySelectorAll(selector));
      if (nodes.length > 0) return nodes;
    }
    return [];
  };

  const extractCommentText = (commentNode) => {
    if (!commentNode) return '';
    // shreddit-comment stores body text in div[slot="comment"]
    const slotNode = commentNode.querySelector('div[slot="comment"]');
    if (slotNode) return slotNode.innerText.trim();
    // fallback for old Reddit
    const mdNode = commentNode.querySelector('.md');
    if (mdNode) return mdNode.innerText.trim();
    return (commentNode.innerText || commentNode.textContent || '').trim();
  };

  window.redditParser = {
    getCommentNodes,
    extractCommentText
  };
})();
