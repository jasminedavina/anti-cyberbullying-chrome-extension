// Offscreen document: runs Person C's ToxicBERT ONNX model in the browser.
// Loaded scripts (from offscreen.html):
//   utils/ort.min.js       → global `ort`  (ONNX Runtime Web v1.17.3)
//   utils/bert-tokenizer.js → global `BertTokenizer`

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
    // Disable SIMD — the SIMD path has memory-alignment bugs with INT8 quantized
    // MatMulInteger ops, causing "memory access out of bounds" WASM traps.
    ort.env.wasm.simd = false;

    // Load ONNX session from bundled model file (105 MB, one-time load).
    // Pin the dynamic axes ('batch' and 'seq' from export_to_onnx.py) to fixed
    // values so ORT pre-allocates the right buffer sizes and avoids bounds errors.
    const modelUrl = chrome.runtime.getURL('models/model.onnx');
    session = await ort.InferenceSession.create(modelUrl, {
      executionProviders: ['wasm'],
      freeDimensionOverrides: { batch: 1, seq: 128 },
    });
    console.log('[ACB] Model inputs:', session.inputNames);

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
  const maxScore = Math.max(...logits.map(sigmoid));
  if (maxScore >= 0.5) return { label: 'toxic', score: maxScore };
  return { label: 'safe', score: 1 - maxScore };
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
