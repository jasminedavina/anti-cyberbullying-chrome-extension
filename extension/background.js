// Service worker: routes PREDICT requests to the offscreen document.
// The offscreen document runs the ONNX model (Person C's ToxicBERT).

const OFFSCREEN_URL = 'offscreen.html';
let creatingOffscreen = null;

async function ensureOffscreen() {
  // hasDocument available since Chrome 116; fall back gracefully for older builds
  const has = typeof chrome.offscreen?.hasDocument === 'function'
    ? await chrome.offscreen.hasDocument()
    : false;
  if (has) return;
  if (creatingOffscreen) { await creatingOffscreen; return; }
  creatingOffscreen = chrome.offscreen.createDocument({
    url:           OFFSCREEN_URL,
    reasons:       ['BLOBS'],
    justification: 'Run ToxicBERT ONNX model inference in the browser without a server',
  }).catch(err => {
    // "already exists" error is OK — another wake-up already created it
    if (!err.message?.includes('already')) throw err;
  });
  await creatingOffscreen;
  creatingOffscreen = null;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // Ignore messages already routed to the offscreen document
  if (message.type !== 'PREDICT' || message.target === 'offscreen') return false;

  ensureOffscreen()
    .then(() => {
      chrome.runtime.sendMessage(
        { target: 'offscreen', type: 'PREDICT', text: message.text },
        (response) => {
          if (chrome.runtime.lastError) {
            console.warn('[ACB] Offscreen error:', chrome.runtime.lastError.message);
            sendResponse(null);
          } else {
            sendResponse(response);
          }
        }
      );
    })
    .catch(err => {
      console.error('[ACB] Could not create offscreen document:', err);
      sendResponse(null);
    });

  return true;
});
