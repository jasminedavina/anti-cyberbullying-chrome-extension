// Minimal BERT WordPiece tokenizer for browser use.
// Reads vocab from the bundled tokenizer.json (model.vocab).
// Matches the saved_model_toxicbert tokenizer config (do_lower_case: false).

class BertTokenizer {
  constructor(vocab) {
    this.vocab = vocab;
    this.unkId  = vocab['[UNK]']  ?? 100;
    this.clsId  = vocab['[CLS]']  ?? 101;
    this.sepId  = vocab['[SEP]']  ?? 102;
    this.padId  = vocab['[PAD]']  ?? 0;
    this.maxInputCharsPerWord = 100;
  }

  // === Normalizer (BertNormalizer, lowercase=false, handle_chinese=true) ===
  _normalize(text) {
    let out = '';
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      if (cp === 0 || cp === 0xFFFD || this._isControl(cp)) continue;
      if (this._isChinese(cp)) { out += ' ' + ch + ' '; continue; }
      if (this._isWhitespace(cp)) { out += ' '; continue; }
      out += ch;
    }
    return out;
  }

  _isControl(cp) {
    if (cp === 0x09 || cp === 0x0A || cp === 0x0D) return false;
    if ((cp >= 0x00 && cp <= 0x1F) || (cp >= 0x7F && cp <= 0x9F)) return true;
    return false;
  }

  _isWhitespace(cp) {
    return cp === 0x20 || cp === 0x09 || cp === 0x0A || cp === 0x0D ||
           cp === 0xA0 || cp === 0x2009 || cp === 0x202F;
  }

  _isChinese(cp) {
    return (cp >= 0x4E00 && cp <= 0x9FFF) || (cp >= 0x3400 && cp <= 0x4DBF) ||
           (cp >= 0x20000 && cp <= 0x2A6DF) || (cp >= 0xF900 && cp <= 0xFAFF) ||
           (cp >= 0x2F800 && cp <= 0x2FA1F);
  }

  _isPunct(cp) {
    if ((cp >= 33 && cp <= 47) || (cp >= 58 && cp <= 64) ||
        (cp >= 91 && cp <= 96) || (cp >= 123 && cp <= 126)) return true;
    const cat = String.fromCodePoint(cp);
    // Unicode P* categories (approximate)
    return /^\p{P}$/u.test(cat) || /^\p{S}$/u.test(cat);
  }

  // === Pre-tokenizer (BertPreTokenizer: whitespace + punctuation split) ===
  _pretokenize(text) {
    const words = [];
    let cur = '';
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      if (cp === 0x20 || this._isWhitespace(cp)) {
        if (cur) { words.push(cur); cur = ''; }
        continue;
      }
      if (this._isPunct(cp)) {
        if (cur) { words.push(cur); cur = ''; }
        words.push(ch);
        continue;
      }
      cur += ch;
    }
    if (cur) words.push(cur);
    return words;
  }

  // === WordPiece ===
  _wordpiece(word) {
    if (word.length > this.maxInputCharsPerWord) return [this.unkId];
    const ids = [];
    let start = 0;
    while (start < word.length) {
      let end = word.length;
      let found = null;
      while (start < end) {
        const substr = (start > 0 ? '##' : '') + word.slice(start, end);
        if (substr in this.vocab) { found = substr; break; }
        end--;
      }
      if (found === null) return [this.unkId];
      ids.push(this.vocab[found]);
      start = end;
    }
    return ids;
  }

  // === Public API ===
  tokenize(text, { max_length = 128, padding = 'max_length', truncation = true } = {}) {
    const norm  = this._normalize(text);
    const words = this._pretokenize(norm);

    // WordPiece all words then flatten
    let tokenIds = [];
    for (const w of words) {
      tokenIds.push(...this._wordpiece(w));
    }

    // Reserve 2 slots for [CLS] and [SEP]
    const maxContent = max_length - 2;
    if (truncation && tokenIds.length > maxContent) {
      tokenIds = tokenIds.slice(0, maxContent);
    }

    const inputIds = [this.clsId, ...tokenIds, this.sepId];
    const len = inputIds.length;

    // Pad to max_length
    const padded = padding === 'max_length'
      ? [...inputIds, ...Array(max_length - len).fill(this.padId)]
      : inputIds;
    const attnMask = padded.map((_, i) => i < len ? 1 : 0);
    const tokenTypeIds = padded.map(() => 0);

    return {
      input_ids:       { data: padded,       dims: [1, padded.length] },
      attention_mask:  { data: attnMask,     dims: [1, padded.length] },
      token_type_ids:  { data: tokenTypeIds, dims: [1, padded.length] },
    };
  }
}

// Module export — loaded as a regular <script> tag (sets window.BertTokenizer)
// OR imported as a module from offscreen.js.
if (typeof module !== 'undefined') module.exports = { BertTokenizer };
