// Streaming AI proxy for ToolNest. Keeps the provider key on Netlify.
// Netlify Node streaming functions expose awslambda.streamifyResponse.
const json = (status, obj) => ({ statusCode: status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }, body: JSON.stringify(obj) });
function parseMessages(b) {
  return (Array.isArray(b.messages) ? b.messages : []).slice(-14)
    .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 40000) }))
    .filter(m => m.content);
}
async function run(event, stream) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Use POST.' });
  const h = event.headers || {}, origin = h.origin || h.Origin || '', host = h.host || h.Host || '';
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (origin && origin.replace(/^https?:\/\//, '') !== host && !allowed.includes(origin)) return json(403, { error: 'Origin not allowed.' });
  if ((event.body || '').length > 120000) return json(413, { error: 'Text is too long.' });
  let b; try { b = JSON.parse(event.body || '{}'); } catch (_) { return json(400, { error: 'Bad request.' }); }
  const messages = parseMessages(b); if (!messages.length) return json(400, { error: 'Nothing to send.' });
  const system = String(b.system || '').slice(0, 4000), maxTokens = Math.min(Math.max(+b.maxTokens || 1000, 100), 3000), temperature = Math.min(Math.max(+b.temperature || 0.4, 0), 1.2);
  const emit = s => { if (s) stream.write('data: ' + JSON.stringify({ text: s }) + '\n\n'); };
  let upstream;
  if (process.env.GEMINI_API_KEY) {
    const contents = messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    const models = [...new Set([process.env.AI_MODEL, 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-flash-latest', 'gemini-flash-lite-latest'].filter(Boolean))], started = Date.now();
    for (const model of models) {
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 6500);
      try {
        upstream = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':streamGenerateContent?alt=sse', {
          method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': String(process.env.GEMINI_API_KEY).trim() }, signal: ctl.signal,
          body: JSON.stringify({ systemInstruction: system ? { parts: [{ text: system }] } : undefined, contents, generationConfig: { maxOutputTokens: maxTokens, temperature, ...(/^gemini-2\.5-flash/.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {}) } })
        });
      } catch (e) { upstream = null; } finally { clearTimeout(timer); }
      if (upstream && upstream.ok) break;
      if (upstream && ![404, 500, 503].includes(upstream.status)) break; // bad key / quota: no point trying other models
      if (Date.now() - started > 8000) break;
    }
    if (!upstream) return json(503, { error: 'The free AI is very busy right now. Please try again in a few seconds.' });
  } else if (process.env.GROQ_API_KEY) {
    const model = process.env.AI_MODEL || 'openai/gpt-oss-20b';
    upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + String(process.env.GROQ_API_KEY).trim() }, body: JSON.stringify({ model, messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages], max_tokens: maxTokens, temperature, stream: true }) });
  } else return json(503, { error: 'AI is not set up. Add GEMINI_API_KEY or GROQ_API_KEY in Netlify.' });
  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '');
    let msg = ''; try { msg = (JSON.parse(detail).error || {}).message || ''; } catch (_) { msg = detail; }
    return json(upstream.status === 429 ? 429 : (upstream.status === 503 ? 503 : 502), { error: upstream.status === 429 ? 'The free AI limit was reached. Try again in a minute.' : upstream.status === 503 ? 'The free AI is very busy right now. Please try again in a few seconds.' : 'AI service error (' + upstream.status + '): ' + String(msg).slice(0, 200) });
  }
  const reader = upstream.body.getReader(), decoder = new TextDecoder(); let buf = '';
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    buf += decoder.decode(value, { stream: true });
    const events = buf.split(/\r?\n\r?\n/); buf = events.pop() || '';
    for (const ev of events) {
      const line = ev.split(/\r?\n/).find(x => x.startsWith('data:'));
      if (!line) continue; const raw = line.slice(5).trim(); if (!raw || raw === '[DONE]') continue;
      try {
        const d = JSON.parse(raw); const t = d.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || d.choices?.[0]?.delta?.content || '';
        emit(t);
      } catch (_) { /* ignore incomplete provider event */ }
    }
  }
  stream.write('data: [DONE]\n\n');
  return null;
}
exports.handler = typeof awslambda !== 'undefined' && awslambda.streamifyResponse
  ? awslambda.streamifyResponse(async (event, responseStream) => {
      const rs = awslambda.HttpResponseStream.from(responseStream, { statusCode: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', 'connection': 'keep-alive', 'x-accel-buffering': 'no' } });
      try { const err = await run(event, rs); if (err) { rs.write('data: ' + JSON.stringify({ error: JSON.parse(err.body).error }) + '\n\n'); } }
      catch (e) { rs.write('data: ' + JSON.stringify({ error: String(e.message || e) }) + '\n\n'); }
      finally { rs.end(); }
    })
  : async event => json(501, { error: 'Streaming is not supported by this Netlify runtime. Update the Netlify Node runtime.' });
