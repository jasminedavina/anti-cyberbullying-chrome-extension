// Lexicon-based detoxification — highlights toxic words and rewrites them
// to a neutral alternative so readers get a calmer version of harmful comments.
(() => {
  // toxic word → neutral replacement  (longest entries first for correct regex order)
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

  // Build sorted map (longest phrase first avoids partial matches)
  const MAP = new Map(RAW_MAP);
  const PATTERN = new RegExp(
    '\\b(' +
    RAW_MAP
      .map(([w]) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|') +
    ')\\b',
    'gi'
  );

  // Returns a cleaned/rephrased copy of the text
  const rephrase = (text) => {
    let out = text
      // word substitutions
      .replace(PATTERN, m => MAP.get(m.toLowerCase()) ?? m)
      // soften ALL-CAPS shouting  (3+ uppercase letters)
      .replace(/\b([A-Z]{3,})\b/g, m => m[0] + m.slice(1).toLowerCase())
      // collapse repeated punctuation  !!!  →  !
      .replace(/([!?]){2,}/g, '$1');
    return out;
  };

  // Wraps every matched toxic word in a <mark class="acb-toxic-word"> inside rootNode.
  // Safe to call multiple times — guarded by data-acb-highlighted attribute.
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

  window.detoxRewriter = { rephrase, highlightInNode };
})();
