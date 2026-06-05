(() => {
  const API_URL = 'http://127.0.0.1:5000/predict';

  // Fallback mock used when Person C's server is not running
  const TOXIC_PATTERNS = [
    /\bstupid\b/i, /\bidiot\b/i, /\bdumb\b/i, /\bshut up\b/i,
    /\bhate you\b/i, /\bloser\b/i, /\bkill yourself\b/i
  ];
  const WARNING_PATTERNS = [
    /\bannoying\b/i, /\btrash\b/i, /\buseless\b/i, /\bawful\b/i
  ];
  const getKeywordScore = (text, patterns) =>
    patterns.reduce((n, p) => n + (p.test(text) ? 1 : 0), 0);

  const mockPredict = (text) => {
    const toxicHits = getKeywordScore(text, TOXIC_PATTERNS);
    const warningHits = getKeywordScore(text, WARNING_PATTERNS);
    if (toxicHits > 0) return { label: 'toxic', score: Math.min(0.98, 0.72 + toxicHits * 0.08), suggestion: '' };
    if (warningHits > 0) return { label: 'warning', score: Math.min(0.7, 0.42 + warningHits * 0.08), suggestion: '' };
    return { label: 'safe', score: 0.05, suggestion: '' };
  };

  const predict = async (text) => {
    const normalized = (text || '').trim();
    if (normalized.length < 3) return { label: 'safe', score: 0.0, suggestion: '' };

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: normalized }),
      });
      if (!response.ok) throw new Error(`API error ${response.status}`);
      return await response.json();
    } catch {
      // Server not running — fall back to mock
      return mockPredict(normalized);
    }
  };

  window.acbModelClient = { predict };
})();
