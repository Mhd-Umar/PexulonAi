// Cloudflare Pages AI helpers. API keys are read only from encrypted runtime secrets.
export const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

export function validateRequest(request, env, bodyText, maxBytes = 80000) {
  if (request.method !== 'POST') return json(405, { error: 'Use POST to call the AI service.' });
  const origin = request.headers.get('origin');
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
  if (origin && origin !== new URL(request.url).origin && !allowed.includes(origin)) {
    return json(403, { error: 'This site origin is not allowed to use the AI service.' });
  }
  if (bodyText.length > maxBytes) return json(413, { error: 'Your message is too long. Please shorten it and try again.' });
  return null;
}

export function parseBody(body, maxMessages = 8, maxChars = 12000) {
  const messages = (Array.isArray(body.messages) ? body.messages : []).slice(-maxMessages)
    .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, maxChars) }))
    .filter(m => m.content);
  if (!messages.length) return { error: 'Please enter a message first.' };
  return {
    messages,
    system: String(body.system || '').slice(0, 8000),
    maxTokens: Math.min(Math.max(Number(body.maxTokens) || 900, 100), 8192),
    temperature: Math.min(Math.max(Number(body.temperature) || 0.4, 0), 1.2)
  };
}

export function modelList(env, streaming = false) {
  const defaults = streaming
    ? ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-flash-latest', 'gemini-flash-lite-latest']
    : ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-flash-latest'];
  return [...new Set([env.AI_MODEL, ...defaults].filter(Boolean))];
}

export function geminiPayload(input) {
  const generationConfig = { maxOutputTokens: input.maxTokens, temperature: input.temperature };
  if (/gemini-2\.5-flash|flash-latest|flash-lite-latest/.test(input.model || '')) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  return {
    ...(input.system ? { systemInstruction: { parts: [{ text: input.system }] } } : {}),
    contents: input.messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    generationConfig
  };
}
