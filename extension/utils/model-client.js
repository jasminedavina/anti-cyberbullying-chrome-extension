(() => {
  // Fallback mock when service worker / model isn't ready yet
  const TOXIC_PATTERNS = [
    /\bstupid\b/i, /\bidiot\b/i, /\bdumb\b/i, /\bshut up\b/i,
    /\bhate you\b/i, /\bloser\b/i, /\bkill yourself\b/i
  ];
  const WARNING_PATTERNS = [
    /\bannoying\b/i, /\btrash\b/i, /\buseless\b/i, /\bawful\b/i
  ];
  const mockPredict = (text) => {
    const t = TOXIC_PATTERNS.reduce((n, p) => n + (p.test(text) ? 1 : 0), 0);
    const w = WARNING_PATTERNS.reduce((n, p) => n + (p.test(text) ? 1 : 0), 0);
    if (t > 0) return { label: 'toxic',   score: Math.min(0.98, 0.72 + t * 0.08), suggestion: '' };
    if (w > 0) return { label: 'warning', score: Math.min(0.70, 0.42 + w * 0.08), suggestion: '' };
    return { label: 'safe', score: 0.05, suggestion: '' };
  };

  const predict = async (text) => {
    const normalized = (text || '').trim();
    if (normalized.length < 3) return { label: 'safe', score: 0.0, suggestion: '' };

    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'PREDICT', text: normalized }, (response) => {
        if (chrome.runtime.lastError || !response) {
          // Service worker not ready — use mock
          resolve(mockPredict(normalized));
        } else {
          resolve(response);
        }
      });
    });
  };

  window.acbModelClient = { predict };
})();
