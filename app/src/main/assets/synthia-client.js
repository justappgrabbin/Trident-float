const pendingSynthia = new Map();
let requestSequence = 0, sending = false;
function synthiaRequest(route, body) {
  return new Promise((resolve, reject) => {
    if (!window.TridentAndroid || typeof TridentAndroid.request !== 'function') {
      reject(Error('This screen requires the integrated Trident Android build.')); return;
    }
    const id = String(++requestSequence);
    const timer = setTimeout(() => {
      pendingSynthia.delete(id); reject(Error('Synthia request timed out.'));
    }, 65000);
    pendingSynthia.set(id, {resolve, reject, timer});
    try { TridentAndroid.request(id, route, JSON.stringify(body ?? {})); }
    catch (error) { settleSynthia(id, null, String(error)); }
  });
}
function settleSynthia(id, payload, error) {
  const pending = pendingSynthia.get(id);
  if (!pending) return;
  clearTimeout(pending.timer); pendingSynthia.delete(id);
  if (error) { pending.reject(Error(error)); return; }
  try { pending.resolve(JSON.parse(payload)); }
  catch { pending.reject(Error('Invalid response from Synthia.')); }
}
function setConnection(message) { document.getElementById('connection').textContent = message; }
async function checkSynthia() {
  setConnection('Checking Synthia…');
  try {
    const audit = await synthiaRequest('/api/audit');
    if (audit.ok !== true) throw Error('Backend wiring audit failed');
    setConnection('Synthia connected · Klein + Morph');
  } catch (e) { setConnection('Synthia disconnected · ' + e.message); }
}
async function openTools() {
  document.getElementById('tools').classList.add('open');
  const target = document.getElementById('toolCatalog'); target.textContent = 'Loading…';
  try {
    const out = await synthiaRequest('/api/tools');
    if (!Array.isArray(out.catalog)) throw Error('Missing tool catalog');
    target.textContent = out.catalog.map(t => t.id + ': ' + (t.description ?? (t.capabilities ?? []).join(', '))).join('\n\n');
  } catch (e) { target.textContent = e.message; }
}
async function runTools() {
  const target = document.getElementById('toolResult'), button = document.getElementById('runTools');
  button.disabled = true;
  try {
    const steps = JSON.parse(document.getElementById('toolSteps').value);
    if (!Array.isArray(steps) || !steps.length || steps.length > 32) throw Error('Enter 1–32 tool steps.');
    const out = await synthiaRequest('/api/tools/run', {steps});
    target.textContent = JSON.stringify(out, null, 2);
  } catch (e) { target.textContent = e.message; }
  finally { button.disabled = false; }
}
