from flask import Flask, request, jsonify
from flask_cors import CORS
from transformers import BertTokenizer, BertForSequenceClassification
import torch

app = Flask(__name__)
CORS(app)  # allow requests from Chrome extension

MODEL_PATH = './saved_model_toxicbert'

tokenizer = BertTokenizer.from_pretrained(MODEL_PATH)
model = BertForSequenceClassification.from_pretrained(MODEL_PATH)
model.eval()

# Map the 6 model labels to 3 extension labels
TOXIC_LABELS = {'toxic', 'severe_toxic', 'threat'}
WARNING_LABELS = {'obscene', 'insult', 'identity_hate'}
ID2LABEL = {0: 'toxic', 1: 'severe_toxic', 2: 'obscene', 3: 'threat', 4: 'insult', 5: 'identity_hate'}

def get_extension_label(scores: dict) -> tuple[str, float]:
    threshold = 0.5
    toxic_score = max(scores.get(l, 0) for l in TOXIC_LABELS)
    warning_score = max(scores.get(l, 0) for l in WARNING_LABELS)

    if toxic_score >= threshold:
        return 'toxic', float(toxic_score)
    if warning_score >= threshold:
        return 'warning', float(warning_score)
    return 'safe', float(1 - max(toxic_score, warning_score))


@app.route('/predict', methods=['POST'])
def predict():
    data = request.get_json()
    text = (data or {}).get('text', '').strip()
    if not text:
        return jsonify({'label': 'safe', 'score': 0.0, 'suggestion': ''}), 200

    inputs = tokenizer(text, return_tensors='pt', truncation=True, max_length=512)
    with torch.no_grad():
        logits = model(**inputs).logits
        probs = torch.sigmoid(logits).squeeze().tolist()

    scores = {ID2LABEL[i]: float(p) for i, p in enumerate(probs)}
    label, score = get_extension_label(scores)

    return jsonify({'label': label, 'score': round(score, 4), 'suggestion': ''})


if __name__ == '__main__':
    print('Starting cyberbullying detection API on http://127.0.0.1:5000')
    app.run(host='127.0.0.1', port=5000)
