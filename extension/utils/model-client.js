(() => {
  const TOXIC_PATTERNS = [
    /\bstupid\b/i, /\bidiot\b/i, /\bdumb\b/i, /\bshut up\b/i,
    /\bhate you\b/i, /\bloser\b/i, /\bkill yourself\b/i,
    /\bannoying\b/i, /\btrash\b/i, /\buseless\b/i, /\bawful\b/i
  ];

  const mockPredict = (text) => {
    const t = TOXIC_PATTERNS.reduce((n, p) => n + (p.test(text) ? 1 : 0), 0);
    if (t > 0) return { label: 'toxic', score: Math.min(0.98, 0.68 + t * 0.08), suggestion: '' };
    return { label: 'safe', score: 0.05, suggestion: '' };
  };

  // Send a no-op message so the service worker wakes up and creates the
  // offscreen document + starts loading the ONNX model in the background.
  const warmup = () => {
    try {
      chrome.runtime.sendMessage({ type: 'WARMUP' }, () => {
        void chrome.runtime.lastError; // suppress "no listener" error
      });
    } catch (_) { /* extension context may be invalidated */ }
  };

  const addSuggestion = async (prediction, text, context = '') => {
    if (!prediction || prediction.label !== 'toxic') {
      return { ...prediction, suggestion: prediction?.suggestion || '' };
    }

    const rewriter = window.detoxRewriter;
    if (rewriter && typeof rewriter.rephraseAsync === 'function') {
      try {
        const suggestion = await rewriter.rephraseAsync(text, context);
        return { ...prediction, suggestion: suggestion || '' };
      } catch (error) {
        console.warn('Anti-cyberbullying: rewrite suggestion failed.', error);
      }
    }

    return { ...prediction, suggestion: prediction.suggestion || '' };
  };

  const predict = async (text, context = '') => {
    const normalized = (text || '').trim();
    if (normalized.length < 3) return { label: 'safe', score: 0.0, suggestion: '' };

    const basePrediction = await new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'PREDICT', text: normalized }, (response) => {
          if (chrome.runtime.lastError || !response) {
            resolve(mockPredict(normalized));
          } else {
            resolve(response);
          }
        });
      } catch (_) {
        // Extension context invalidated (e.g., extension reloaded mid-session)
        resolve(mockPredict(normalized));
      }
    });

    return addSuggestion(basePrediction, normalized, context);
  };

  window.acbModelClient = { predict, mockPredict, warmup };
})();
