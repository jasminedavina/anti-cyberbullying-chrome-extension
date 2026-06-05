(() => {
  const parser     = window.redditParser;
  const highlighter = window.commentHighlighter;
  const modelClient = window.acbModelClient;
  const heatmap    = window.threadHeatmap;

  if (!parser || !highlighter || !modelClient) {
    console.warn('Anti-cyberbullying: missing parser, highlighter, or model client.');
    return;
  }

  // Warm up the service worker + offscreen document immediately so the ONNX
  // model starts loading before any comments need to be classified.
  modelClient.warmup?.();

  const seenComments = new WeakSet();

  const processNode = (node) => {
    if (seenComments.has(node)) return;
    seenComments.add(node);

    const text = parser.extractCommentText(node);
    if (!text) return;

    // Pass 1 — instant mock label so the UI responds immediately.
    const mock = modelClient.mockPredict(text);
    highlighter.applyLabel(node, mock.label);

    // Pass 2 — real ONNX model; update label (and heatmap) when ready.
    modelClient
      .predict(text)
      .then((real) => {
        highlighter.applyLabel(node, real.label);
        heatmap?.increment(real.label);
      })
      .catch(() => {
        heatmap?.increment(mock.label);
      });
  };

  const scanComments = (root = document) => {
    // Include root itself when the observer passes a comment node directly
    // (querySelectorAll only finds descendants, not the root element itself)
    if (root instanceof Element && root.matches('shreddit-comment, [data-testid="comment"], [data-test-id="comment"]')) {
      processNode(root);
    }
    for (const node of parser.getCommentNodes(root)) {
      processNode(node);
    }
  };

  scanComments(document);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) scanComments(node);
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
