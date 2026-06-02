(() => {
  const parser = window.redditParser;
  const highlighter = window.commentHighlighter;

  if (!parser || !highlighter) {
    console.warn('Anti-cyberbullying: missing parser or highlighter.');
    return;
  }

  const seenComments = new WeakSet();

  const getMockLabel = (text) => (/stupid/i.test(text) ? 'toxic' : 'safe');

  const scanComments = (root = document) => {
    const nodes = parser.getCommentNodes(root);
    for (const node of nodes) {
      if (seenComments.has(node)) continue;
      seenComments.add(node);

      const text = parser.extractCommentText(node);
      if (!text) continue;

      const label = getMockLabel(text);
      highlighter.applyLabel(node, label);
    }
  };

  scanComments(document);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          scanComments(node);
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
