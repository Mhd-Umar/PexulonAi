// ToolNest AI proxy for Netlify Functions.
// Set GEMINI_API_KEY (recommended) or GROQ_API_KEY in Netlify environment variables.
const hits = new Map();
const json = (statusCode, value) => ({
  statusCode,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  body: JSON.stringify(value)
});
const clean = (v, max) => String(v == null ? '' : v).slice(0, max);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Use POST to call the AI service.' });

  const headers = event.headers || {};
  const origin = headers.origin || headers.Origin || '';
  const host = headers.host || headers.Host || '';
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
  const sameHost = !origin || origin.replace(/^https?:\/\//i, '').replace(/\/$/, '') === host;
  if (!sameHost && !allowed.includes(origin)) return json(403, { error: 'Request origin is not allowed.' });

  const ip = (headers['x-nf-client-connection-ip'] || headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < 60000);
  if (recent.length >= 12) return json(429, { error: 'AI request limit reached. Please wait one minute and try again.' });
  recent.push(now); hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();

  if (!event.body || event.body.length > 120000) return json(413, { error: 'Request is empty or too large.' });
  let input;
  try { input = JSON.parse(event.body); }
  catch (_) { return json(400, { error: 'Invalid JSON request.' }); }

  const messages = (Array.isArray(input.messages) ? input.messages : [])
    .slice(-14)
    .map(m => ({ role: m && m.role === 'assistant' ? 'assistant' : 'user', content: clean(m && m.content, 24000) }))
    .filter(m => m.content.trim());
  if (!messages.length) return json(400, { error: 'Please enter a message first.' });

  const system = clean(input.system, 4000);
  const maxTokens = Math.min(Math.max(Number(input.maxTokens) || 1200, 100), 3000);
  const temperature = Math.min(Math.max(Number(input.temperature) || 0.4, 0), 1.2);
  const apiKeyGemini = clean(process.env.GEMINI_API_KEY, 500).trim();
  const apiKeyGroq = clean(process.env.GROQ_API_KEY, 500).trim();
  if (!apiKeyGemini && !apiKeyGroq) {
    return json(503, { error: 'AI is not configured. Add GEMINI_API_KEY or GROQ_API_KEY in Netlify → Environment variables, then redeploy.' });
  }

  try {
    if (apiKeyGemini) {
      const configured = clean(process.env.AI_MODEL, 100).trim();
      const models = [...new Set([configured, input.fast ? 'gemini-2.5-flash' : 'gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'].filter(Boolean))];
      const contents = messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
      let lastStatus = 502;
      let lastMessage = 'No Gemini model returned a response.';
      for (const model of models) {
        const payload = {
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          contents,
          generationConfig: { maxOutputTokens: maxTokens, temperature }
        };
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25000);
        let response, result;
        try {
          response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKeyGemini },
            body: JSON.stringify(payload),
            signal: controller.signal
          });
          result = await response.json().catch(() => ({}));
        } finally { clearTimeout(timeout); }

        if (response && response.ok) {
          const answer = (result.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
          if (answer) return json(200, { text: answer });
          lastStatus = 502;
          lastMessage = result.promptFeedback?.blockReason
            ? `Gemini blocked this prompt (${result.promptFeedback.blockReason}). Try rephrasing.`
            : 'Gemini returned an empty answer. Please try again.';
          continue;
        }
        lastStatus = response ? response.status : 502;
        lastMessage = clean(result.error?.message || `Gemini request failed (${lastStatus}).`, 240);
        // Invalid key, permission, or malformed request cannot be fixed by changing models.
        if ([400, 401, 403].includes(lastStatus)) break;
      }
      const status = lastStatus === 429 ? 429 : ([401, 403].includes(lastStatus) ? 502 : 502);
      return json(status, { error: `Gemini AI error (${lastStatus}): ${lastMessage}` });
    }

    const model = clean(process.env.AI_MODEL, 100).trim() || 'openai/gpt-oss-20b';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    let response, result;
    try {
      response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKeyGroq}` },
        body: JSON.stringify({ model, messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages], max_tokens: maxTokens, temperature }),
        signal: controller.signal
      });
      result = await response.json().catch(() => ({}));
    } finally { clearTimeout(timeout); }
    if (!response.ok) return json(response.status === 429 ? 429 : 502, { error: `Groq AI error (${response.status}): ${clean(result.error?.message || 'Provider request failed.', 240)}` });
    const answer = clean(result.choices?.[0]?.message?.content, 50000).trim();
    return answer ? json(200, { text: answer }) : json(502, { error: 'Groq returned an empty answer. Please try again.' });
  } catch (error) {
    const message = error && error.name === 'AbortError' ? 'AI provider timed out. Please try again.' : clean(error && error.message || error, 200);
    console.error('ToolNest AI function error:', message);
    return json(502, { error: `AI proxy failed: ${message || 'Unknown server error.'}` });
  }
};
