// Offscreen document: runs Person C's ToxicBERT ONNX model in the browser.
// Loaded scripts (from offscreen.html):
//   utils/ort.min.js       → global `ort`  (ONNX Runtime Web v1.17.3)
//   utils/bert-tokenizer.js → global `BertTokenizer`

const TOXIC_LABELS   = new Set(['toxic', 'severe_toxic', 'threat']);
const WARNING_LABELS = new Set(['obscene', 'insult', 'identity_hate']);
const ID2LABEL = ['toxic', 'severe_toxic', 'obscene', 'threat', 'insult', 'identity_hate'];

let session   = null;
let tokenizer = null;
let loading   = null;

const loadModel = () => {
  if (session && tokenizer) return Promise.resolve();
  if (loading) return loading;

  loading = (async () => {
    // Load WASM backend from CDN (cached in browser after first fetch)
    ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.3/dist/';
    ort.env.wasm.numThreads = 1;

    // Load ONNX session from bundled model file (105 MB, one-time load)
    const modelUrl = chrome.runtime.getURL('models/model.onnx');
    session = await ort.InferenceSession.create(modelUrl, { executionProviders: ['wasm'] });

    // Load vocab from bundled tokenizer.json and build tokenizer
    const tokUrl   = chrome.runtime.getURL('models/tokenizer.json');
    const tokData  = await fetch(tokUrl).then(r => r.json());
    tokenizer = new BertTokenizer(tokData.model.vocab);

    console.log('[ACB] ToxicBERT model + tokenizer ready.');
  })();
  return loading;
};

const sigmoid = x => 1 / (1 + Math.exp(-x));

const mapLogits = (logits) => {
  const scores = {};
  logits.forEach((v, i) => { scores[ID2LABEL[i]] = sigmoid(v); });
  const toxicScore   = Math.max(...[...TOXIC_LABELS].map(l => scores[l] ?? 0));
  const warningScore = Math.max(...[...WARNING_LABELS].map(l => scores[l] ?? 0));
  if (toxicScore   >= 0.5) return { label: 'toxic',   score: toxicScore };
  if (warningScore >= 0.5) return { label: 'warning', score: warningScore };
  return { label: 'safe', score: 1 - Math.max(toxicScore, warningScore) };
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.target !== 'offscreen' || message.type !== 'PREDICT') return false;

  loadModel()
    .then(async () => {
      const enc = tokenizer.tokenize(message.text, {
        max_length: 128, truncation: true, padding: 'max_length'
      });

      const makeTensor = (arr, dims) =>
        new ort.Tensor('int64', BigInt64Array.from(arr, v => BigInt(v)), dims);

      const feeds = {
        input_ids:      makeTensor(enc.input_ids.data,      enc.input_ids.dims),
        attention_mask: makeTensor(enc.attention_mask.data,  enc.attention_mask.dims),
        token_type_ids: makeTensor(enc.token_type_ids.data,  enc.token_type_ids.dims),
      };

      const out = await session.run(feeds);
      sendResponse({ ...mapLogits(Array.from(out.logits.data)), suggestion: '' });
    })
    .catch(err => {
      console.error('[ACB] ToxicBERT error:', err);
      sendResponse(null);
    });

  return true;
});
