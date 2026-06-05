// Service worker: loads ToxicBERT model via Transformers.js and handles predictions.
// Model is downloaded from HuggingFace (~90MB quantized) on first use, then cached.
importScripts('utils/transformers.min.js');

const MODEL_ID = 'Xenova/toxic-bert';
const TOXIC_LABELS  = new Set(['toxic', 'severe_toxic', 'threat']);
const WARNING_LABELS = new Set(['obscene', 'insult', 'identity_hate']);

let classifier = null;
let loading = null;

const getClassifier = () => {
  if (classifier) return Promise.resolve(classifier);
  if (loading) return loading;
  loading = self.Transformers.pipeline('text-classification', MODEL_ID, {
    quantized: true,
    multi_label: true,
  }).then(clf => { classifier = clf; return clf; });
  return loading;
};

const mapResults = (results) => {
  const scores = {};
  for (const { label, score } of results) scores[label.toLowerCase()] = score;

  const toxicScore   = Math.max(...[...TOXIC_LABELS].map(l => scores[l] ?? 0));
  const warningScore = Math.max(...[...WARNING_LABELS].map(l => scores[l] ?? 0));
  const threshold = 0.5;

  if (toxicScore >= threshold)   return { label: 'toxic',   score: toxicScore };
  if (warningScore >= threshold) return { label: 'warning', score: warningScore };
  return { label: 'safe', score: 1 - Math.max(toxicScore, warningScore) };
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'PREDICT') return false;

  getClassifier()
    .then(clf => clf(message.text, { topk: null }))
    .then(results => sendResponse({ ...mapResults(results), suggestion: '' }))
    .catch(err => {
      console.error('ToxicBERT prediction failed:', err);
      sendResponse(null); // content script falls back to mock
    });

  return true; // keep message channel open for async response
});
