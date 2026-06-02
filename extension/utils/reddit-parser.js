(() => {
  const COMMENT_SELECTOR = 'div[data-testid="comment"]';
  const FALLBACK_SELECTORS = ['div[data-test-id="comment"]', '.md'];

  const getCommentNodes = (root = document) =>
    Array.from(root.querySelectorAll(COMMENT_SELECTOR));

  const findBodyNode = (commentNode) => {
    for (const selector of FALLBACK_SELECTORS) {
      const match = commentNode.querySelector(selector);
      if (match) return match;
    }
    return commentNode;
  };

  const extractCommentText = (commentNode) => {
    if (!commentNode) return '';
    const bodyNode = findBodyNode(commentNode);
    const text = bodyNode && (bodyNode.innerText || bodyNode.textContent);
    return text ? text.trim() : '';
  };

  window.redditParser = {
    getCommentNodes,
    extractCommentText
  };
})();
