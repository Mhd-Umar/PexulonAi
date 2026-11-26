// Netlify Function: free-AI proxy that keeps your API key secret.
// Env vars (Netlify → Site settings → Environment variables):
//   GEMINI_API_KEY  (free key from Google AI Studio)   or   GROQ_API_KEY  (free key from console.groq.com)
//   optional: AI_MODEL, ALLOWED_ORIGINS (comma list; defaults to the site's own origin)
const hits = new Map();
const json = (status, obj) => ({ statusCode: status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }, body: JSON.stringify(obj) });

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Use POST.' });
  const h = event.headers || {}, origin = h.origin || h.Origin || '', host = h.host || h.Host || '';
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const okOrigin = !origin || origin.replace(/^https?:\/\//, '') === host || allowed.includes(origin);
  if (!okOrigin) return json(403, { error: 'Origin not allowed.' });
  // best-effort rate limit per IP (resets when the function instance restarts)
  const ip = (h['x-nf-client-connection-ip'] || h['x-forwarded-for'] || 'x').split(',')[0].trim(), now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => now - t < 60000); if (arr.length >= 12) return json(429, { error: 'Too many requests. Wait a minute and try again.' });
  arr.push(now); hits.set(ip, arr); if (hits.size > 5000) hits.clear();
  if ((event.body || '').length > 120000) return json(413, { error: 'Text is too long.' });
  let b; try { b = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Bad request.' }); }
  const messages = (Array.isArray(b.messages) ? b.messages : []).slice(-14).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 40000) })).filter(m => m.content);
  if (!messages.length) return json(400, { error: 'Nothing to send.' });
  const system = String(b.system || '').slice(0, 4000), maxTokens = Math.min(Math.max(+b.maxTokens || 1000, 100), 3000), temperature = Math.min(Math.max(+b.temperature || 0.4, 0), 1.2);
  try {
    if (process.env.GEMINI_API_KEY) {
      const models = [...new Set((b.fast ? ['gemini-2.5-flash', process.env.AI_MODEL, 'gemini-flash-latest', 'gemini-2.5-flash-lite', 'gemini-flash-lite-latest'] : [process.env.AI_MODEL, 'gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-flash-lite-latest']).filter(Boolean))];
      const body = JSON.stringify({ systemInstruction: system ? { parts: [{ text: system }] } : undefined, contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })), generationConfig: { maxOutputTokens: maxTokens, temperature } });
      const bodyFor = m => /^gemini-2\.5-flash(-lite)?$/.test(m) ? body.replace('"generationConfig":{', '"generationConfig":{"thinkingConfig":{"thinkingBudget":0},') : body;
      let last = { status: 502, msg: '' };
      for (const model of models) {
        for (let attempt = 0; attempt < 2; attempt++) {
          const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': String(process.env.GEMINI_API_KEY).trim() }, body: bodyFor(model) });
          const d = await r.json().catch(() => ({}));
          if (r.ok) { const text = (d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts || []).map(p => p.text || '').join(''); return json(200, { text: text || 'The AI returned an empty answer. Try rephrasing.' }); }
          last = { status: r.status, msg: String((d.error && d.error.message) || '').slice(0, 200) };
          if (r.status === 400 || r.status === 401 || r.status === 403) return json(502, { error: 'AI service error (' + r.status + '): ' + last.msg });
          if (r.status === 503 && attempt === 0) { await new Promise(x => setTimeout(x, 700)); continue; }
          break; // 429, 404, 503 again: try the next model
        }
      }
      return json(last.status === 429 ? 429 : 503, { error: last.status === 429 ? 'The free AI limit was reached. Try again in a minute.' : 'The AI is very busy right now. Please try again in a few seconds.' });
    }
    if (process.env.GROQ_API_KEY) {
      const model = process.env.AI_MODEL || 'openai/gpt-oss-20b';
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + String(process.env.GROQ_API_KEY).trim() }, body: JSON.stringify({ model, messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages], max_tokens: maxTokens, temperature }) });
      const d = await r.json().catch(() => ({})); if (!r.ok) return json(r.status === 429 ? 429 : 502, { error: r.status === 429 ? 'The free AI limit was reached. Try again in a minute.' : 'AI service error (' + r.status + '): ' + String((d.error && d.error.message) || '').slice(0, 200) });
      return json(200, { text: (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '' });
    }
    return json(503, { error: 'AI is not set up on this site yet. Add GEMINI_API_KEY or GROQ_API_KEY in Netlify, or paste your own free key in Settings (⚙).' });
  } catch (e) { return json(502, { error: 'Could not reach the AI service: ' + String(e && e.message || e).slice(0, 160) }); }
};
