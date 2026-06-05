(() => {
  const parser = window.redditParser;
  const highlighter = window.commentHighlighter;
  const modelClient = window.acbModelClient;

  const heatmap = window.threadHeatmap;

  if (!parser || !highlighter || !modelClient) {
    console.warn('Anti-cyberbullying: missing parser, highlighter, or model client.');
    return;
  }

  const seenComments = new WeakSet();

  const scanComments = (root = document) => {
    const nodes = parser.getCommentNodes(root);
    for (const node of nodes) {
      if (seenComments.has(node)) continue;
      seenComments.add(node);

      const text = parser.extractCommentText(node);
      if (!text) continue;

      modelClient
        .predict(text)
        .then((prediction) => {
          highlighter.applyLabel(node, prediction.label);
          heatmap?.increment(prediction.label);
        })
        .catch((error) => {
          console.warn('Anti-cyberbullying: comment prediction failed.', error);
        });
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
