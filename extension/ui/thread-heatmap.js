// Thread-level toxicity heatmap injected above the comment tree.
// Call threadHeatmap.increment(label) after each comment is classified.
(() => {
  const counts = { safe: 0, toxic: 0 };
  let bar = null;

  const health = (pct) => {
    if (pct < 0.05)  return { label: 'Healthy',     color: '#2e7d32' };
    if (pct < 0.15)  return { label: 'Moderate',    color: '#f57c00' };
    if (pct < 0.30)  return { label: 'Concerning',  color: '#d84315' };
    return               { label: 'Toxic',       color: '#c62828' };
  };

  const render = () => {
    if (!bar) return;
    const total = counts.safe + counts.toxic;
    const pct   = total > 0 ? counts.toxic / total : 0;
    const { label, color } = health(pct);

    bar.querySelector('.acb-heatmap__fill').style.cssText =
      `width:${Math.round(pct * 100)}%; background:${color}`;
    bar.querySelector('.acb-heatmap__health').textContent = label;
    bar.querySelector('.acb-heatmap__health').style.color = color;
    bar.querySelector('.acb-heatmap__safe').textContent   = `${counts.safe} safe`;
    bar.querySelector('.acb-heatmap__toxic').textContent  = `${counts.toxic} toxic`;
    bar.querySelector('.acb-heatmap__pct').textContent    =
      total > 0 ? `(${Math.round(pct * 100)}% toxic)` : '';
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
        <span class="acb-heatmap__health">Scanning…</span>
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
  };

  const increment = (label) => {
    if (!bar || !bar.isConnected) mount();
    if (label === 'toxic') counts.toxic++; else counts.safe++;
    render();
  };

  // Try mounting as soon as the DOM is ready
  if (document.readyState !== 'loading') mount();
  else document.addEventListener('DOMContentLoaded', mount);

  window.threadHeatmap = { increment, mount };
})();
