"""
Converts saved_model_toxicbert to quantized ONNX for use in the browser.
Run with Python 3.12 (not Anaconda base -- it has broken packages):
    py -3.12 personC/export_to_onnx.py

Output: extension/models/model.onnx  (~110 MB, INT8 quantized)
        extension/models/tokenizer.json  (vocab for JS tokenizer)
"""
import os, sys, shutil
from pathlib import Path

# Force UTF-8 output so Windows cp1252 doesn't crash on emoji in torch logs
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import torch
from transformers import BertForSequenceClassification, BertTokenizer
from onnxruntime.quantization import quantize_dynamic, QuantType

ROOT        = Path(__file__).parent
MODEL_PATH  = ROOT / 'saved_model_toxicbert'
OUT_DIR     = ROOT.parent / 'extension' / 'models'
RAW_ONNX    = OUT_DIR / 'model_raw.onnx'
FINAL_ONNX  = OUT_DIR / 'model.onnx'

OUT_DIR.mkdir(parents=True, exist_ok=True)

print('Loading model...')
model     = BertForSequenceClassification.from_pretrained(str(MODEL_PATH))
tokenizer = BertTokenizer.from_pretrained(str(MODEL_PATH))
model.eval()

print('Step 1/3 — Tracing with dummy input...')
enc = tokenizer('example text', return_tensors='pt', max_length=128,
                padding='max_length', truncation=True)
input_ids      = enc['input_ids']
attention_mask = enc['attention_mask']
token_type_ids = enc['token_type_ids']

print('Step 2/3 — Exporting to ONNX...')
torch.onnx.export(
    model,
    (input_ids, attention_mask, token_type_ids),
    str(RAW_ONNX),
    input_names=['input_ids', 'attention_mask', 'token_type_ids'],
    output_names=['logits'],
    dynamic_axes={
        'input_ids':      {0: 'batch', 1: 'seq'},
        'attention_mask': {0: 'batch', 1: 'seq'},
        'token_type_ids': {0: 'batch', 1: 'seq'},
        'logits':         {0: 'batch'},
    },
    opset_version=12,
    do_constant_folding=True,
)
print(f'  Raw ONNX: {RAW_ONNX.stat().st_size / 1e6:.1f} MB')

print('Step 3/3 — Merging external data then quantizing to INT8...')
import onnx as onnx_lib
merged = OUT_DIR / 'model_merged.onnx'
model_proto = onnx_lib.load(str(RAW_ONNX), load_external_data=True)
onnx_lib.save(model_proto, str(merged), save_as_external_data=False)
print(f'  Merged ONNX: {merged.stat().st_size / 1e6:.1f} MB')

quantize_dynamic(str(merged), str(FINAL_ONNX), weight_type=QuantType.QInt8)
merged.unlink()
RAW_ONNX.unlink()
(OUT_DIR / 'model_raw.onnx.data').unlink(missing_ok=True)
print(f'  Quantized ONNX: {FINAL_ONNX.stat().st_size / 1e6:.1f} MB')

# Copy tokenizer files needed by the JS tokenizer
print('Copying tokenizer files...')
for fname in ['tokenizer.json', 'tokenizer_config.json', 'vocab.txt']:
    src = MODEL_PATH / fname
    if src.exists():
        shutil.copy(src, OUT_DIR / fname)
        print(f'  Copied {fname}')

print(f'\nDone! Files saved to: {OUT_DIR}')
print('Reload the Chrome extension to use Person C\'s model.')
