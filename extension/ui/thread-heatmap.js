// Thread-level toxicity heatmap injected above the comment tree.
// Call threadHeatmap.markPending() before each prediction,
// threadHeatmap.increment(label) after each prediction resolves.
(() => {
  const counts = { safe: 0, toxic: 0 };
  let pending = 0;
  let bar = null;
  let scanDoneTimer = null;

  const health = (pct) => {
    if (pct < 0.05)  return { label: 'Healthy',    color: '#2e7d32' };
    if (pct < 0.15)  return { label: 'Moderate',   color: '#f57c00' };
    if (pct < 0.30)  return { label: 'Concerning', color: '#d84315' };
    return               { label: 'Toxic',      color: '#c62828' };
  };

  const render = () => {
    if (!bar) return;
    const total    = counts.safe + counts.toxic;
    const scanned  = total;
    const inFlight = pending;

    const healthEl = bar.querySelector('.acb-heatmap__health');
    const fillEl   = bar.querySelector('.acb-heatmap__fill');
    const safeEl   = bar.querySelector('.acb-heatmap__safe');
    const toxicEl  = bar.querySelector('.acb-heatmap__toxic');
    const pctEl    = bar.querySelector('.acb-heatmap__pct');
    const scanEl   = bar.querySelector('.acb-heatmap__scanning');

    if (inFlight > 0) {
      // Scanning state — animated indeterminate bar
      healthEl.textContent = `Analyzing… (${scanned + inFlight} comments)`;
      healthEl.style.color = '#5f6368';
      fillEl.style.cssText = 'width:100%; background:#e0e0e0; animation: acb-scan-pulse 1.4s ease-in-out infinite;';
      safeEl.textContent   = `${counts.safe} safe`;
      toxicEl.textContent  = `${counts.toxic} toxic`;
      pctEl.textContent    = inFlight > 0 ? `${inFlight} pending…` : '';
      if (scanEl) { scanEl.style.display = ''; }
    } else {
      // Done state — show health bar
      const pct = total > 0 ? counts.toxic / total : 0;
      const { label, color } = health(pct);

      healthEl.textContent = label;
      healthEl.style.color = color;
      fillEl.style.cssText = `width:${Math.round(pct * 100)}%; background:${color}; animation:none;`;
      safeEl.textContent   = `${counts.safe} safe`;
      toxicEl.textContent  = `${counts.toxic} toxic`;
      pctEl.textContent    = total > 0 ? `(${Math.round(pct * 100)}% toxic)` : '';
      if (scanEl) { scanEl.style.display = 'none'; }
    }
  };

  const mount = () => {
    if (bar && bar.isConnected) return;
    const anchor = document.querySelector(
      'shreddit-comment-tree, [data-testid="comment-list"], #comment-tree-content, .commentarea'
    );
    if (!anchor) return;

    bar = document.createElement('div');
    bar.className = 'acb-heatmap';
    bar.innerHTML = `
      <div class="acb-heatmap__header">
        <span class="acb-heatmap__icon" aria-hidden="true">🛡️</span>
        <span class="acb-heatmap__title">Community Health</span>
        <span class="acb-heatmap__scanning acb-heatmap__scanning--dot" aria-hidden="true"></span>
        <span class="acb-heatmap__health">Waiting…</span>
      </div>
      <div class="acb-heatmap__track">
        <div class="acb-heatmap__fill"></div>
      </div>
      <div class="acb-heatmap__stats">
        <span class="acb-heatmap__safe">0 safe</span>
        <span class="acb-heatmap__dot" aria-hidden="true"> · </span>
        <span class="acb-heatmap__toxic">0 toxic</span>
        <span class="acb-heatmap__pct"></span>
      </div>
    `;
    anchor.insertAdjacentElement('beforebegin', bar);
    render();
  };

  // Called before a predict() request is sent.
  const markPending = () => {
    if (!bar || !bar.isConnected) mount();
    pending++;
    if (scanDoneTimer) { clearTimeout(scanDoneTimer); scanDoneTimer = null; }
    render();
  };

  // Called when a predict() resolves (replaces the old increment API).
  const increment = (label) => {
    if (!bar || !bar.isConnected) mount();
    if (label === 'toxic') counts.toxic++; else counts.safe++;
    pending = Math.max(0, pending - 1);
    render();
  };

  // Try mounting as soon as the DOM is ready
  if (document.readyState !== 'loading') mount();
  else document.addEventListener('DOMContentLoaded', mount);

  window.threadHeatmap = { increment, markPending, mount };
})();
