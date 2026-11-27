import { json, validateRequest, parseBody, modelList, geminiPayload } from '../_lib/ai.js';

export async function onRequestPost({ request, env }) {
  let raw;
  try { raw = await request.text(); } catch { return json(400, { error: 'Invalid request data.' }); }
  const invalid = validateRequest(request, env, raw, 80000);
  if (invalid) return invalid;
  let body;
  try { body = JSON.parse(raw || '{}'); } catch { return json(400, { error: 'Invalid request data.' }); }
  const input = parseBody(body, 8, 12000);
  if (input.error) return json(400, { error: input.error });

  const key = String(env.GEMINI_API_KEY || '').trim();
  if (!key) return json(503, { error: 'Gemini is not configured. Add GEMINI_API_KEY under this Pages project Settings → Variables and Secrets, then redeploy.' });

  let lastStatus = 502, lastMessage = '';
  for (const model of modelList(env, false)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 18000);
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(geminiPayload(input)),
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        const answer = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
        return answer ? json(200, { text: answer }) : json(502, { error: 'The AI provider returned no text. Please rephrase your question.' });
      }
      lastStatus = response.status;
      lastMessage = String(data.error?.message || '').slice(0, 180);
      if (response.status === 401 || response.status === 403) return json(502, { error: 'Gemini rejected the API key or its permissions. Check the GEMINI_API_KEY Secret.' });
      if (response.status === 429) return json(429, { error: 'Gemini free-tier quota is temporarily exhausted. Please wait and try again.' });
      if (![404, 500, 503].includes(response.status)) break;
    } catch (error) {
      if (error?.name === 'AbortError') return json(504, { error: 'Gemini took too long to respond. Please try again.' });
      return json(502, { error: 'Could not connect to Gemini. Check the Pages Function logs and try again.' });
    } finally { clearTimeout(timer); }
  }
  return json(lastStatus >= 500 ? 503 : 502, { error: `Gemini service error (${lastStatus})${lastMessage ? ': ' + lastMessage : '. Check the API key, enabled API and model name.'}` });
}

export async function onRequest({ request }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' } });
  return json(405, { error: 'Use POST to call the AI service.' });
        }
