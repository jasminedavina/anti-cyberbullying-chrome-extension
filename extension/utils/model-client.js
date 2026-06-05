(() => {
  const TOXIC_PATTERNS = [
    /\bstupid\b/i,
    /\bidiot\b/i,
    /\bdumb\b/i,
    /\bshut up\b/i,
    /\bhate you\b/i,
    /\bloser\b/i,
    /\bkill yourself\b/i
  ];

  const WARNING_PATTERNS = [
    /\bannoying\b/i,
    /\btrash\b/i,
    /\buseless\b/i,
    /\bawful\b/i
  ];

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const getKeywordScore = (text, patterns) =>
    patterns.reduce((score, pattern) => score + (pattern.test(text) ? 1 : 0), 0);

  const buildSuggestion = (text, label) => {
    if (label === 'safe') return '';

    const replacements = [
      [/\bstupid\b/gi, 'unclear'],
      [/\bidiot\b/gi, 'person'],
      [/\bdumb\b/gi, 'not helpful'],
      [/\bshut up\b/gi, 'please pause'],
      [/\bhate you\b/gi, 'disagree with you'],
      [/\bloser\b/gi, 'person'],
      [/\bkill yourself\b/gi, 'please get support'],
      [/\btrash\b/gi, 'not good'],
      [/\buseless\b/gi, 'not effective'],
      [/\bawful\b/gi, 'frustrating']
    ];

    let rewritten = text;
    for (const [pattern, replacement] of replacements) {
      rewritten = rewritten.replace(pattern, replacement);
    }

    if (rewritten === text) {
      return 'I disagree with this, but I want to explain my point respectfully.';
    }
    return rewritten;
  };

  const predict = async (text) => {
    const normalized = (text || '').trim();
    await wait(120);

    if (normalized.length < 3) {
      return { label: 'safe', score: 0.05, suggestion: '' };
    }

    const toxicHits = getKeywordScore(normalized, TOXIC_PATTERNS);
    const warningHits = getKeywordScore(normalized, WARNING_PATTERNS);

    let label = 'safe';
    let score = 0.12;

    if (toxicHits > 0) {
      label = 'toxic';
      score = Math.min(0.98, 0.72 + toxicHits * 0.08 + warningHits * 0.04);
    } else if (warningHits > 0) {
      label = 'warning';
      score = Math.min(0.7, 0.42 + warningHits * 0.08);
    }

    return {
      label,
      score,
      suggestion: buildSuggestion(normalized, label)
    };
  };

  window.acbModelClient = {
    predict
  };
})();
