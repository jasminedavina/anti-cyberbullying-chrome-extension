# Person A — Toxic Content Detection: Technical Documentation

## 1. Overview

Person A's role is to build the **toxic content detection layer** of the anti-cyberbullying Chrome extension. This covers two tightly related problems:

1. **Reader module** — scan existing Reddit comments and classify each one as `safe` or `toxic`.
2. **Writer module** — intercept what a user is typing in a Reddit comment box and warn them in real time if their draft contains harmful language.

Both modules share the same underlying ML model and inference pipeline, run entirely **inside the browser** with no external server required.

---

## 2. System Architecture

```
Reddit Web Page (reddit.com)
         │
         ▼
Chrome Extension (content scripts injected at document_idle)
┌──────────────────────────────────────────────────────────────┐
│  reddit-parser.js        — extract comment text from DOM     │
│  model-client.js         — send text to model, get label     │
│  comment-highlighter.js  — apply Safe / Toxic label + blur   │
│  thread-heatmap.js       — aggregate thread health score     │
│  typing-prevention.js    — detect & warn on draft input      │
│  detox-rewriter.js       — rephrase toxic text (Gemini/lex.) │
└─────────────────┬────────────────────────────────────────────┘
                  │  chrome.runtime.sendMessage (PREDICT)
                  ▼
         background.js  (Service Worker — routes messages)
                  │
                  ▼
         offscreen.js   (hidden page — runs ONNX model)
         ┌─────────────────────────────────┐
         │  bert-tokenizer.js  (vocab)     │
         │  ort.min.js  (ONNX Runtime Web) │
         │  models/model.onnx  (ToxicBERT) │
         └─────────────────────────────────┘
```

### Key design decisions

| Decision | Reason |
|---|---|
| Offscreen document for inference | Chrome MV3 service workers cannot load WASM. The Offscreen API provides a hidden page that can. |
| ONNX + WASM backend | Runs Python-trained PyTorch model in-browser without a server or Python. |
| INT8 dynamic quantization | Reduces model from ~420 MB (FP32) to ~110 MB while keeping acceptable accuracy. |
| WASM SIMD disabled | The INT8 `MatMulInteger` op has memory-alignment bugs with SIMD enabled; disabling avoids WASM traps. |
| Warmup message | Service worker sends a no-op `WARMUP` message on page load to pre-load the model before the first comment arrives. |

---

## 3. Machine Learning Model

### 3.1 Base Model — ToxicBERT

The final model used in the extension is **`unitary/toxic-bert`**, a `bert-base-uncased` checkpoint fine-tuned on the [Jigsaw Toxic Comment Classification dataset](https://www.kaggle.com/c/jigsaw-toxic-comment-classification-challenge). It is a **multi-label classifier** that scores text across six dimensions simultaneously:

| Label ID | Label | Meaning |
|---|---|---|
| 0 | `toxic` | General toxicity |
| 1 | `severe_toxic` | Extremely offensive content |
| 2 | `obscene` | Crude, vulgar language |
| 3 | `threat` | Threats of harm |
| 4 | `insult` | Personal insults |
| 5 | `identity_hate` | Attacks based on identity (race, gender, religion, etc.) |

Model configuration (from `personC/saved_model_toxicbert/config.json`):

```
Architecture:       BertForSequenceClassification
Hidden size:        768
Attention heads:    12
Hidden layers:      12
Max position emb.:  512
Problem type:       multi_label_classification
Vocab size:         30,522
```

### 3.2 Model Experimentation (personC Notebook)

The team explored three BERT variants before settling on ToxicBERT:

| Model | Source | F1 Score | Notes |
|---|---|---|---|
| **DistilBERT** | `distilbert-base-uncased` | ~45% | Faster; weaker on hate detection |
| **HateBERT** | `GroNLP/hateBERT` | ~45–60% | Pre-trained on Reddit hate speech (RAL-E corpus) |
| **ToxicBERT** | `unitary/toxic-bert` | Best overall | Already fine-tuned on 160k toxic comments |

For HateBERT, a **hyperparameter search** was run using Optuna:
```
Best run: learning_rate=2.47e-05, num_train_epochs=10, batch_size=8
```

### 3.3 Training Data

Two datasets were combined for HateBERT experiments:

- **`cardiffnlp/tweet_eval` (hate split)** — binary hate-speech labels on tweets.
- **`stanfordnlp/imdb`** — sentiment reviews (added to increase non-toxic coverage).

Class imbalance was addressed using **weighted cross-entropy loss** (`sklearn.utils.class_weight.compute_class_weight('balanced', ...)`), implemented via a custom `WeightedLossTrainer` subclass of HuggingFace `Trainer`.

---

## 4. Text Mining Techniques

### 4.1 BERT WordPiece Tokenization

**What it is:** WordPiece is a subword tokenization algorithm. Instead of splitting text on whitespace alone, it breaks rare or unknown words into smaller known pieces, allowing the model to handle out-of-vocabulary terms.

**Algorithm:**
```
word "cyberbullying"
→ try full word → not in vocab
→ try "cyber" + "##bullying" → found
→ output token IDs: [ID("cyber"), ID("##bullying")]
```
The `##` prefix indicates a continuation piece (not a word start).

**Implementation:** A full BERT-compatible WordPiece tokenizer was re-implemented in JavaScript (`extension/utils/bert-tokenizer.js`) to run in the browser without importing a Python library. It replicates the `BertNormalizer` → `BertPreTokenizer` → `WordPiece` pipeline exactly as the HuggingFace tokenizer produces it.

**Pipeline stages:**

```
Raw text
   │
   ▼  BertNormalizer
   │  - Strip null/control chars (keep \t \n \r)
   │  - Space-pad Chinese characters (for character-level segmentation)
   │  - Preserve whitespace variants (NBSP, thin space, etc.)
   │
   ▼  BertPreTokenizer
   │  - Split on whitespace
   │  - Split on punctuation (each punct becomes its own token)
   │
   ▼  WordPiece
   │  - Greedy longest-match subword segmentation
   │  - Unknown words → [UNK] (ID 100)
   │
   ▼  Special tokens
   │  [CLS] + token_ids + [SEP]  (then pad to max_length=128)
   │
   ▼  Output tensors
      input_ids      [1 × 128]  int64
      attention_mask [1 × 128]  int64  (1=real, 0=padding)
      token_type_ids [1 × 128]  int64  (all 0 for single-sequence)
```

**Key parameters:**
- `max_length = 128` (truncate + pad)
- `do_lower_case = false` (matches ToxicBERT tokenizer config)
- `maxInputCharsPerWord = 100` (words longer → `[UNK]`)

### 4.2 Transfer Learning & Fine-tuning

**What it is:** Instead of training a model from scratch, we start with a BERT model pre-trained on billions of words of text (Wikipedia + BookCorpus). Pre-training teaches the model rich contextual word representations. Fine-tuning adds a classification head on top and continues training on the task-specific (toxic/hate speech) dataset for a small number of epochs.

This is the core text mining technique: the pre-trained contextual embeddings capture semantic meaning, syntax, and even pragmatic tone far better than bag-of-words or TF-IDF approaches.

**Why it matters for toxicity detection:**
- `"You are the best"` and `"You are the worst"` have near-identical BoW features, but BERT's attention mechanism distinguishes their meaning through context.
- Sarcasm, implicit insults, and coded language are partially captured through pre-training exposure.

### 4.3 Multi-Label Classification with Sigmoid

Standard classification uses softmax (one label wins). Multi-label classification applies a **sigmoid** to each logit independently, producing 6 independent probabilities — one per toxicity dimension. A comment can be both `obscene` AND `insult` simultaneously.

In the extension, the six logit scores are combined with:
```
maxScore = max(sigmoid(logit_i) for i in [0..5])
if maxScore >= 0.5 → label = 'toxic'
else              → label = 'safe'
```

This gives a single binary output for the UI while the model internally captures fine-grained toxicity types.

### 4.4 INT8 Dynamic Quantization

**What it is:** After training, the model weights (stored as 32-bit floats) are converted to 8-bit integers. This is a post-training quantization step that requires no retraining.

**Why:** The raw FP32 BERT model is ~420 MB — too large to ship in a Chrome extension. INT8 quantization reduces it to ~110 MB while retaining most accuracy, since BERT's performance is dominated by the learned weight patterns rather than their numerical precision.

**How it was done** (`personC/export_to_onnx.py`):
```python
# Step 1: trace the PyTorch model → ONNX (opset 12)
torch.onnx.export(model, dummy_inputs, raw_onnx, ...)

# Step 2: merge external data shards into single file
onnx.save(model_proto, merged, save_as_external_data=False)

# Step 3: INT8 dynamic quantization
quantize_dynamic(merged, final_onnx, weight_type=QuantType.QInt8)
```

### 4.5 Lexicon-Based Toxic Word Detection (Fallback)

**What it is:** A hand-curated dictionary of ~50 toxic terms mapped to neutral equivalents, combined with a compiled regex pattern for fast matching.

**Used in two places:**
1. `model-client.js` — `mockPredict()`: counts toxic pattern matches to produce a mock score when the real ONNX model fails to load.
2. `detox-rewriter.js` — `rephrase()`: word-substitution fallback when the Gemini API is unavailable.

**Example entries:**
```
"kill yourself" → "please seek help"
"idiot"         → "person"
"worthless"     → "not contributing"
```

The regex is built dynamically from the map keys with `\b` word boundaries and the `gi` flags (case-insensitive, global):
```javascript
const PATTERN = new RegExp('\\b(' + words.join('|') + ')\\b', 'gi');
```

### 4.6 DOM Text Extraction (Reddit Comment Parsing)

**What it is:** Reddit changed its frontend to a web-component architecture (`shreddit-comment`). Extracting comment text requires different CSS selectors for new Reddit vs. old Reddit.

**Selectors tried in order:**
```javascript
['shreddit-comment', 'div[data-testid="comment"]', 
 'div[data-test-id="comment"]', '.md']
```

Text is extracted from the `div[slot="comment"]` slot inside shreddit-comment web components (new Reddit), or `.md` nodes (old Reddit). This is a structured text extraction step analogous to HTML scraping in a web crawling pipeline.

### 4.7 MutationObserver for Dynamic Content

Reddit loads comments asynchronously (infinite scroll, reply expansion). A `MutationObserver` watches for newly added DOM nodes and triggers the classification pipeline on each new comment node as it appears, ensuring no comment is missed.

```javascript
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType === Node.ELEMENT_NODE) scanComments(node);
    }
  }
});
observer.observe(document.body, { childList: true, subtree: true });
```

A `WeakSet` (`seenComments`) prevents the same comment node from being classified twice.

### 4.8 Debounced Real-Time Input Classification

**What it is:** Rather than calling the model on every keystroke (expensive), a debounce timer waits 550 ms after the user stops typing before sending the prediction request. This is a standard rate-limiting technique for real-time NLP inference.

```javascript
const DEBOUNCE_MS = 550;
clearTimeout(state.timerId);
state.timerId = window.setTimeout(() => runPrediction(editor), DEBOUNCE_MS);
```

A `requestId` counter ensures that only the most recent outstanding prediction result is applied — if the user types quickly, stale responses from earlier keystrokes are ignored.

### 4.9 Gemini API Integration for Text Detoxification

**What it is:** When a toxic comment is revealed (reader module) or detected in the draft (writer module), the system requests a semantically-aware rewrite from the Gemini 2.0 Flash API.

**Prompt engineering:**
```
"You are helping make online conversations healthier. 
Rephrase the following toxic or harmful comment into a kinder, 
more constructive version that keeps any valid underlying point 
without offensive language. Keep it brief and in the same language. 
Return only the rephrased text — no explanation, no quotes."
```

This leverages a large language model's understanding of semantics and tone to produce rewrites that preserve the meaning while removing harmful content — something the lexicon substitution approach cannot do for complex sentences.

---

## 5. Chrome Extension Components

### 5.1 `manifest.json` — Extension Manifest (MV3)

Declares permissions (`storage`, `offscreen`), host permissions for Reddit and the CDN, the background service worker, and content scripts.

```json
"content_security_policy": {
  "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; ..."
}
```
`wasm-unsafe-eval` is required to execute WebAssembly (the ONNX runtime).

### 5.2 `background.js` — Service Worker (Message Router)

Acts as a relay: content scripts cannot directly access the offscreen document. The service worker:
1. Creates the offscreen document on first `PREDICT` request (or proactively on `WARMUP`).
2. Forwards `PREDICT` messages to the offscreen document.
3. Returns the result back to the content script.

### 5.3 `offscreen.js` + `offscreen.html` — ONNX Inference Runtime

Loads the 110 MB ToxicBERT ONNX model once, then handles all prediction requests:

```javascript
const session = await ort.InferenceSession.create(modelUrl, {
  executionProviders: ['wasm'],
  freeDimensionOverrides: { batch: 1, seq: 128 },
});
```

`freeDimensionOverrides` pins the dynamic axes to fixed sizes so the WASM runtime pre-allocates buffers correctly, avoiding memory bounds errors with INT8 ops.

### 5.4 `bert-tokenizer.js` — Browser-Side Tokenizer

Full WordPiece tokenizer (section 4.1), reading the vocab from `models/tokenizer.json`. Produces the three tensors (`input_ids`, `attention_mask`, `token_type_ids`) expected by the BERT model's ONNX graph.

### 5.5 `reddit-parser.js` — Comment Extractor

Provides `getCommentNodes(root)` and `extractCommentText(node)` — the DOM parsing layer for both new and old Reddit.

### 5.6 `model-client.js` — Prediction API

Public interface for content scripts:
- `predict(text)` — sends a `PREDICT` message and resolves with `{ label, score, suggestion }`. Falls back to `mockPredict` on any error.
- `mockPredict(text)` — regex-based local fallback.
- `warmup()` — sends a no-op `WARMUP` message to pre-load the model.

### 5.7 `comment-highlighter.js` — Comment Labeling & Blur

Applies visual treatment to classified comments:

| State | Visual |
|---|---|
| Safe | Green outline + green `SAFE` pill (CSS `::before`) |
| Toxic | Red outline + red `TOXIC` pill + body blurred |
| Revealed (toxic) | Blur removed; detox rewriter panel appended |

The `::before` label pill is rendered via CSS on the host element — outside the comment body's shadow DOM/slot — so it is never accidentally blurred.

### 5.8 `thread-heatmap.js` — Community Health Score

Aggregates per-comment predictions into a thread-level widget injected above the comment tree:

| Toxic % | Label | Colour |
|---|---|---|
| < 5% | Healthy | Green |
| 5–15% | Moderate | Orange |
| 15–30% | Concerning | Dark orange |
| > 30% | Toxic | Red |

While predictions are in flight, an animated indeterminate bar with `Analyzing…` is shown. The bar transitions to the final score once all pending predictions resolve.

### 5.9 `typing-prevention.js` — Real-Time Draft Checker

Attaches to any `textarea`, `contenteditable`, or `shreddit-composer` (including shadow DOM) that is a Reddit comment editor. On every input event (debounced 550 ms):

1. Extracts the draft text.
2. Calls `modelClient.predict(text)`.
3. Updates the inline panel:
   - **Idle** (< 3 chars): "Start typing to check tone"
   - **Checking**: "Checking tone…"
   - **Safe**: green "Looks respectful" + confidence %
   - **Toxic**: red "Toxic language detected" + confidence % + optional rewrite suggestion

If a rewrite is suggested and the user clicks **"Use rewrite"**, the draft text is replaced with the cleaned version via `document.execCommand('insertText')`, and the model re-runs on the new text.

### 5.10 `detox-rewriter.js` — Comment Rewriter

Two-tier rewriting:

1. **Gemini 2.0 Flash API** (primary): sends the original text to the Gemini generative API with a detoxification prompt. Returns a fluent, context-aware rewrite.
2. **Lexicon substitution** (fallback): regex-based word replacement using a 50-entry toxic→neutral dictionary. Also highlights matched words in the revealed comment body with a `<mark class="acb-toxic-word">` tooltip showing the neutral alternative.

### 5.11 `style.css` — Visual Language

Provides all CSS for:
- Safe/toxic label pills (`::before` pseudo-element, `content: attr(data-acb-label)`)
- Blur overlay with "Tap to reveal" button
- Thread heatmap widget
- Toxic word `<mark>` highlights
- Rephrased comment panel
- Typing-prevention inline panel

---

## 6. End-to-End Data Flow

### Reader flow (existing comments)

```
Page loads
  → reddit-reader.js sends WARMUP → model starts loading
  → reddit-parser.getCommentNodes() → list of comment DOM nodes
  → for each node:
      redditParser.extractCommentText(node) → raw text string
      threadHeatmap.markPending()
      modelClient.predict(text)
        → chrome.runtime.sendMessage({ type: 'PREDICT', text })
        → background.js ensures offscreen doc exists
        → offscreen.js: BertTokenizer.tokenize(text) → tensors
        → ort.InferenceSession.run(feeds) → logits Float32Array
        → sigmoid → maxScore → { label, score }
        → sendResponse back to content script
      commentHighlighter.applyLabel(node, label)
      threadHeatmap.increment(label)
  → MutationObserver: repeat for dynamically loaded comments
```

### Writer flow (user typing)

```
User focuses comment editor
  → typing-prevention.js: attachEditor(editor)
  → ensurePanel(editor): inject .acb-prevention-panel below editor
  → user types text
  → debounce 550 ms
  → modelClient.predict(draftText) → { label, score, suggestion }
  → setPanelState(editor, prediction)
    - toxic → red panel + optional rewrite suggestion
    - safe  → green panel
  → if user clicks "Use rewrite":
      setEditorText(editor, suggestion)
      runPrediction(editor) → re-evaluate cleaned text
```

---

## 7. Model Export Pipeline (`personC/export_to_onnx.py`)

```
personC/saved_model_toxicbert/  (HuggingFace PyTorch model)
  │
  ▼  torch.onnx.export (opset 12, dynamic axes)
  │
  model_raw.onnx  (~420 MB FP32, with external data shards)
  │
  ▼  onnx.load + onnx.save (merge external data → single file)
  │
  model_merged.onnx
  │
  ▼  onnxruntime.quantization.quantize_dynamic (QInt8)
  │
  extension/models/model.onnx  (~110 MB INT8)
  extension/models/tokenizer.json  (vocab for BertTokenizer.js)
```

---

## 8. Text Mining Techniques — Summary Table

| Technique | Where Used | Purpose |
|---|---|---|
| **WordPiece subword tokenization** | `bert-tokenizer.js`, Python training | Convert raw text → token IDs for BERT input |
| **Text normalization** | `bert-tokenizer.js` (BertNormalizer) | Remove control chars, unify whitespace |
| **Transfer learning (BERT fine-tuning)** | `personC/notebooks/` training | Leverage pre-trained language representations |
| **Multi-label classification** | ToxicBERT model output | Score 6 toxicity dimensions simultaneously |
| **Sigmoid activation** | `offscreen.js` mapLogits | Convert raw logits to independent probabilities |
| **INT8 dynamic quantization** | `export_to_onnx.py` | Compress model 4× for browser delivery |
| **Weighted loss (class balancing)** | `WeightedLossTrainer` | Handle dataset imbalance during fine-tuning |
| **Hyperparameter search (Optuna)** | HateBERT experiments | Find optimal learning rate, epochs, batch size |
| **Lexicon-based matching (regex)** | `model-client.js`, `detox-rewriter.js` | Fast pattern-based toxicity fallback + rewriting |
| **DOM text extraction** | `reddit-parser.js` | Scrape comment content from structured HTML |
| **Debounced real-time inference** | `typing-prevention.js` | Rate-limit model calls during typing |
| **Prompt engineering (LLM)** | `detox-rewriter.js` | Guide Gemini to produce tone-appropriate rewrites |
| **MutationObserver** | `reddit-reader.js` | Detect dynamically injected comment nodes |
| **ONNX + WASM runtime** | `offscreen.js`, `ort.min.js` | Run Python-trained model in-browser |

---

## 9. File Index

```
extension/
├── manifest.json                 Chrome MV3 extension config
├── background.js                 Service worker — message router
├── offscreen.html                Hidden page host for ONNX runtime
├── offscreen.js                  ONNX inference + response handler
├── models/
│   ├── model.onnx                ToxicBERT INT8 quantized (~110 MB)
│   ├── tokenizer.json            BERT vocab (30,522 tokens)
│   └── tokenizer_config.json     Tokenizer settings
├── utils/
│   ├── bert-tokenizer.js         Browser WordPiece tokenizer
│   ├── model-client.js           predict() / mockPredict() / warmup()
│   ├── detox-rewriter.js         Gemini API + lexicon rewriter
│   ├── reddit-parser.js          DOM comment extractor
│   └── ort.min.js                ONNX Runtime Web v1.17.3
├── ui/
│   ├── comment-highlighter.js    Blur + label + reveal panel
│   └── thread-heatmap.js         Thread-level toxicity summary widget
├── content_scripts/
│   ├── reddit-reader.js          Scan + classify existing comments
│   └── typing-prevention.js      Real-time draft checking
└── css/
    └── style.css                 All extension UI styles

personC/
├── notebooks/
│   └── cyberbullying_detection_BERT.ipynb   Model training experiments
├── saved_model_toxicbert/        HuggingFace ToxicBERT checkpoint
├── export_to_onnx.py             PyTorch → ONNX → INT8 pipeline
└── server.py                     Flask inference API (alternative)
```
