// Netlify Function: bounded-time AI proxy. Keep provider keys server-side.
// Configure GEMINI_API_KEY or GROQ_API_KEY in Netlify environment variables.
const hits = new Map();
const json = (status, obj) => ({ statusCode: status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, body: JSON.stringify(obj) });
const clip = (v, n) => String(v || '').slice(0, n);

async function fetchWithTimeout(url, options, ms = 7600) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Use POST to call the AI service.' });
  const h = event.headers || {}, origin = h.origin || h.Origin || '', host = h.host || h.Host || '';
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (origin && origin.replace(/^https?:\/\//, '') !== host && !allowed.includes(origin)) return json(403, { error: 'This site origin is not allowed to use the AI service.' });
  const ip = (h['x-nf-client-connection-ip'] || h['x-forwarded-for'] || 'unknown').split(',')[0].trim(), now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < 60000);
  if (recent.length >= 12) return json(429, { error: 'Too many AI requests. Please wait one minute.' });
  recent.push(now); hits.set(ip, recent); if (hits.size > 3000) hits.clear();
  if ((event.body || '').length > 80000) return json(413, { error: 'Your message is too long. Please shorten it and try again.' });
  let b; try { b = JSON.parse(event.body || '{}'); } catch (_) { return json(400, { error: 'Invalid request data.' }); }
  const messages = (Array.isArray(b.messages) ? b.messages : []).slice(-8).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: clip(m.content, 12000) })).filter(m => m.content);
  if (!messages.length) return json(400, { error: 'Please enter a message first.' });
  const system = clip(b.system, 3000), maxTokens = Math.min(Math.max(Number(b.maxTokens) || 900, 100), 1400), temperature = Math.min(Math.max(Number(b.temperature) || 0.4, 0), 1.2);

  // Prefer Groq when explicitly configured; it is a separate fallback provider.
  if (process.env.GROQ_API_KEY) {
    try {
      const model = process.env.GROQ_MODEL || process.env.AI_MODEL || 'openai/gpt-oss-20b';
      const r = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + String(process.env.GROQ_API_KEY).trim() }, body: JSON.stringify({ model, messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages], max_tokens: maxTokens, temperature }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) return json(200, { text: clip(d.choices?.[0]?.message?.content, 30000) || 'The AI returned an empty answer. Please try again.' });
      if (r.status !== 429 && !process.env.GEMINI_API_KEY) return json(502, { error: 'Groq AI error (' + r.status + '): ' + clip(d.error?.message, 180) });
    } catch (e) { if (e.name !== 'AbortError' && !process.env.GEMINI_API_KEY) return json(504, { error: 'Groq AI service could not respond. Please try again.' }); }
  }

  if (!process.env.GEMINI_API_KEY) return json(503, { error: 'AI is not configured. Add GEMINI_API_KEY or GROQ_API_KEY in Netlify → Environment variables, then redeploy.' });
  const key = String(process.env.GEMINI_API_KEY).trim();
  const candidates = [...new Set([process.env.AI_MODEL, 'gemini-2.5-flash-lite', 'gemini-flash-lite-latest'].filter(Boolean))];
  let lastStatus = 502, lastMessage = '';
  for (let i = 0; i < candidates.length; i++) {
    const model = candidates[i];
    const payload = { contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })), generationConfig: { maxOutputTokens: maxTokens, temperature } };
    if (system) payload.systemInstruction = { parts: [{ text: system }] };
    if (/^gemini-2\.5/.test(model)) payload.generationConfig.thinkingConfig = { thinkingBudget: 0 };
    try {
      const r = await fetchWithTimeout('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(payload) }, 6900);
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        const answer = (d.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
        if (answer) return json(200, { text: answer });
        return json(502, { error: 'The AI provider returned no text. Please rephrase your question.' });
      }
      lastStatus = r.status; lastMessage = clip(d.error?.message, 180);
      if (r.status === 401 || r.status === 403) return json(502, { error: 'Gemini rejected the API key or its permissions. Check GEMINI_API_KEY in Netlify.' });
      if (r.status === 429) return json(429, { error: 'Gemini free-tier quota is temporarily exhausted. Please wait and try again.' });
      if (r.status !== 404) break;
    } catch (e) {
      if (e.name === 'AbortError') return json(504, { error: 'Gemini took too long to respond. Try again in a moment, or configure GROQ_API_KEY as a backup provider.' });
      return json(502, { error: 'Could not connect to Gemini. Check the Netlify function logs and try again.' });
    }
  }
  return json(lastStatus >= 500 ? 503 : 502, { error: 'Gemini service error (' + lastStatus + ')' + (lastMessage ? ': ' + lastMessage : '. Please check the API key, enabled API and model name.') });
};
