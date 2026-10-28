// Small helper to ask an LLM for JSON. Default: Google Gemini free tier (GEMINI_API_KEY). Optional: AI_PROVIDER=anthropic.
let modelCache = null;
async function pickModel() {   // model names change over time, so pick a currently available free-tier one unless MODEL is set
  if (process.env.MODEL) return process.env.MODEL;
  if (modelCache) return modelCache;
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error('list models ' + r.status);
  const names = ((await r.json()).models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name.replace(/^models\//, ''));
  const ver = n => parseFloat((n.match(/gemini-([\d.]+)/) || [0, 0])[1]);
  const stable = names.filter(n => /^gemini-[\d.]+-flash(-lite)?(-\d+)?$/.test(n));
  const pool = stable.length ? stable : names.filter(n => /flash/.test(n) && !/image|tts|live|audio|embedding|robotics|computer/.test(n));
  pool.sort((a, b) => (/lite/.test(b) - /lite/.test(a)) || ver(b) - ver(a));
  if (!pool.length) throw new Error('no usable Gemini model');
  modelCache = pool[0]; console.log('Gemini model:', modelCache); return modelCache;
}
async function askJson(system, input) {
  let txt = '';
  if ((process.env.AI_PROVIDER || 'gemini') === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: process.env.MODEL || 'claude-haiku-5-5', max_tokens: 300, system, messages: [{ role: 'user', content: input }] }) });
    if (!r.ok) throw new Error('anthropic ' + r.status);
    const d = await r.json(); txt = (d.content && d.content[0] && d.content[0].text) || '';
  } else {
    const model = await pickModel();
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', { method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: input }] }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 300, temperature: 0 } }) });
    if (!r.ok) throw new Error('gemini ' + r.status);
    const d = await r.json(); const c = d.candidates && d.candidates[0] && d.candidates[0].content;
    txt = (c && c.parts && c.parts[0] && c.parts[0].text) || '';
  }
  return JSON.parse(txt.replace(/```json|```/g, '').trim());
}
module.exports = { askJson };
