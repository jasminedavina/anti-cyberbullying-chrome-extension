// Detox rewriter — rephrases toxic comments.
// Primary: Gemini 2.0 Flash API (set GEMINI_API_KEY below).
// Fallback: lexicon-based word substitution when API is unavailable.
(() => {
  // ── API key ─────────────────────────────────────────────────────────────
  // Get a free key at https://aistudio.google.com/apikey then paste it here.
  const GEMINI_API_KEY = '';
  const GEMINI_URL =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

  // ── Lexicon fallback ─────────────────────────────────────────────────────
  const RAW_MAP = [
    ['kill yourself',  'please seek help'],
    ['shut up',        'please stop'],
    ['worthless',      'not contributing'],
    ['disgusting',     'unpleasant'],
    ['incompetent',    'inexperienced'],
    ['dumbasses',      'misguided people'],
    ['dumbass',        'misguided person'],
    ['stupidity',      'poor reasoning'],
    ['stupidly',       'mistakenly'],
    ['stupid',         'mistaken'],
    ['pathetic',       'disappointing'],
    ['idiotic',        'questionable'],
    ['idiots',         'people'],
    ['idiot',          'person'],
    ['morons',         'people'],
    ['moronic',        'flawed'],
    ['moron',          'person'],
    ['retarded',       'misguided'],
    ['retard',         'person'],
    ['losers',         'people'],
    ['loser',          'person'],
    ['useless',        'ineffective'],
    ['garbage',        'poor quality'],
    ['filthy',         'unclean'],
    ['horrific',       'very bad'],
    ['horrible',       'quite bad'],
    ['terrible',       'quite bad'],
    ['awful',          'quite bad'],
    ['hating',         'strongly disliking'],
    ['hated',          'strongly disliked'],
    ['hates',          'strongly dislikes'],
    ['hate',           'strongly dislike'],
    ['liars',          'unreliable people'],
    ['liar',           'unreliable person'],
    ['lying',          'being dishonest'],
    ['cringe',         'awkward'],
    ['cringy',         'awkward'],
    ['weirdo',         'unusual person'],
    ['creep',          'odd person'],
    ['freak',          'unusual person'],
    ['coward',         'timid person'],
    ['jerk',           'unkind person'],
    ['trash',          'poor'],
    ['dumb',           'mistaken'],
    ['kys',            'please get help'],
  ];

  const MAP = new Map(RAW_MAP);
  const PATTERN = new RegExp(
    '\\b(' +
    RAW_MAP.map(([w]) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') +
    ')\\b',
    'gi'
  );

  const rephrase = (text) =>
    text
      .replace(PATTERN, m => MAP.get(m.toLowerCase()) ?? m)
      .replace(/\b([A-Z]{3,})\b/g, m => m[0] + m.slice(1).toLowerCase())
      .replace(/([!?]){2,}/g, '$1');

  // ── Gemini API call ──────────────────────────────────────────────────────
  const rephraseAsync = async (text) => {
    if (!GEMINI_API_KEY) return rephrase(text);

    try {
      const resp = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text:
                'You are helping make online conversations healthier. ' +
                'Rephrase the following toxic or harmful comment into a kinder, ' +
                'more constructive version that keeps any valid underlying point ' +
                'without offensive language. Keep it brief and in the same language. ' +
                'Return only the rephrased text — no explanation, no quotes.\n\n' +
                `Original: ${text}`
            }]
          }],
          generationConfig: { maxOutputTokens: 200, temperature: 0.7 }
        })
      });

      if (!resp.ok) return rephrase(text);

      const data = await resp.json();
      const result = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      return result || rephrase(text);
    } catch (_) {
      return rephrase(text);
    }
  };

  // ── Toxic word highlighting ──────────────────────────────────────────────
  const highlightInNode = (rootNode) => {
    if (!rootNode || rootNode.dataset.acbHighlighted) return;
    rootNode.dataset.acbHighlighted = '1';

    const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const skip = node.parentElement.closest(
          '.acb-reveal-overlay, .acb-rephrased, .acb-label, mark'
        );
        return skip ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });

    const textNodes = [];
    let n;
    while ((n = walker.nextNode())) textNodes.push(n);

    for (const textNode of textNodes) {
      PATTERN.lastIndex = 0;
      if (!PATTERN.test(textNode.textContent)) continue;

      PATTERN.lastIndex = 0;
      const src  = textNode.textContent;
      const frag = document.createDocumentFragment();
      let last = 0, m;

      while ((m = PATTERN.exec(src)) !== null) {
        if (m.index > last) frag.appendChild(document.createTextNode(src.slice(last, m.index)));
        const mark = document.createElement('mark');
        mark.className = 'acb-toxic-word';
        mark.textContent = m[0];
        mark.title = `Neutral version: "${MAP.get(m[0].toLowerCase()) ?? m[0]}"`;
        frag.appendChild(mark);
        last = m.index + m[0].length;
      }
      if (last < src.length) frag.appendChild(document.createTextNode(src.slice(last)));
      PATTERN.lastIndex = 0;

      textNode.parentNode.replaceChild(frag, textNode);
    }
  };

  window.detoxRewriter = { rephrase, rephraseAsync, highlightInNode };
})();
