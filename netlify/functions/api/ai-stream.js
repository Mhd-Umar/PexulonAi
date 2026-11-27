import { json, validateRequest, parseBody, modelList, geminiPayload } from '../_lib/ai.js';

export async function onRequestPost({ request, env }) {
  let raw;
  try { raw = await request.text(); } catch { return json(400, { error: 'Bad request.' }); }
  const invalid = validateRequest(request, env, raw, 120000);
  if (invalid) return invalid;
  let body;
  try { body = JSON.parse(raw || '{}'); } catch { return json(400, { error: 'Bad request.' }); }
  const input = parseBody(body, 14, 40000);
  if (input.error) return json(400, { error: 'Nothing to send.' });
  const key = String(env.GEMINI_API_KEY || '').trim();
  if (!key) return json(503, { error: 'Gemini is not configured. Add GEMINI_API_KEY under Pages Settings → Variables and Secrets, then redeploy.' });

  let upstream = null, lastStatus = 502, lastMessage = '';
  for (const model of modelList(env, true)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key, 'accept': 'text/event-stream' },
        body: JSON.stringify(geminiPayload(input)),
        signal: controller.signal
      });
      clearTimeout(timer);
      if (upstream.ok) break;
      lastStatus = upstream.status;
      const detail = await upstream.json().catch(() => ({}));
      lastMessage = String(detail.error?.message || '').slice(0, 180);
      if (upstream.status === 401 || upstream.status === 403) return json(502, { error: 'Gemini rejected the API key or its permissions. Check the GEMINI_API_KEY Secret.' });
      if (upstream.status === 429) return json(429, { error: 'Gemini free-tier quota is temporarily exhausted. Please wait and try again.' });
      if (![404, 500, 503].includes(upstream.status)) break;
    } catch (error) {
      clearTimeout(timer);
      if (error?.name === 'AbortError') return json(504, { error: 'Gemini took too long to start streaming. Please try again.' });
      return json(502, { error: 'Could not connect to Gemini. Check the Pages Function logs.' });
    }
  }
  if (!upstream?.ok || !upstream.body) return json(lastStatus >= 500 ? 503 : 502, { error: `Gemini streaming error (${lastStatus})${lastMessage ? ': ' + lastMessage : ''}` });

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = upstream.body.getReader();
  const output = new ReadableStream({
    async start(controller) {
      let buffer = '';
      const send = (obj) => controller.enqueue(encoder.encode('data: ' + JSON.stringify(obj) + '\n\n'));
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split(/\r?\n\r?\n/);
          buffer = events.pop() || '';
          for (const event of events) {
            const line = event.split(/\r?\n/).find(x => x.startsWith('data:'));
            if (!line) continue;
            const rawData = line.slice(5).trim();
            if (!rawData || rawData === '[DONE]') continue;
            try {
              const data = JSON.parse(rawData);
              const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
              if (text) send({ text });
              if (data.error?.message) send({ error: data.error.message });
            } catch { /* Ignore partial or non-JSON provider events. */ }
          }
        }
        send({ done: true });
      } catch (error) {
        send({ error: 'The Gemini stream was interrupted. Please try again.' });
      } finally {
        try { reader.releaseLock(); } catch {}
        controller.close();
      }
    },
    cancel() { reader.cancel().catch(() => {}); }
  });
  return new Response(output, { status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', 'x-content-type-options': 'nosniff' } });
}

export async function onRequest({ request }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type, accept' } });
  return json(405, { error: 'Use POST.' });
}
