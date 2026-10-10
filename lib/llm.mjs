// Chat clients for AGENT=ollama | openai | anthropic. Each returns { text, message } where `message`
// is the assistant turn to append to the history before the next request.

const SYSTEM = 'You write animated explainer videos as code. Follow the brief exactly and reply only in the file format it specifies.';

/** Any OpenAI-compatible /chat/completions endpoint: Ollama, LM Studio, llama.cpp, vLLM, OpenAI, OpenRouter... */
async function openaiChat(agent, messages, onToken) {
  if (!agent.model) throw new Error(`Set AGENT_MODEL in .env (the model name to request from ${agent.baseUrl})`);
  let response;
  try {
    response = await fetch(`${agent.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(agent.apiKey ? { authorization: `Bearer ${agent.apiKey}` } : {}) },
      body: JSON.stringify({ model: agent.model, stream: true, messages: [{ role: 'system', content: SYSTEM }, ...messages] })
    });
  } catch (error) {
    throw new Error(`Cannot reach ${agent.baseUrl} (${error.cause?.code || error.message}). ${agent.id === 'ollama' ? 'Is Ollama running? Try: ollama serve' : 'Check LLM_BASE_URL.'}`);
  }
  if (!response.ok) throw new Error(`${agent.baseUrl} answered ${response.status}: ${(await response.text()).slice(0, 500)}`);
  // Streaming keeps slow local models from hitting HTTP idle timeouts.
  let text = '', buffer = '';
  const decoder = new TextDecoder();
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      const data = line.trim().replace(/^data:\s*/, '');
      if (!data || data === '[DONE]' || !line.trim().startsWith('data:')) continue;
      let delta;
      try { delta = JSON.parse(data).choices?.[0]?.delta?.content; } catch { continue; }
      if (delta) { text += delta; onToken(delta.length); }
    }
  }
  if (!text.trim()) throw new Error(`${agent.model} returned an empty reply`);
  return { text, message: { role: 'assistant', content: text } };
}

// Models that accept adaptive thinking with an effort level, and server-side refusal fallbacks.
const EFFORT_MODELS = /^claude-(fable-5|mythos-5|opus-5|opus-4-[678]|sonnet-5|sonnet-4-6|haiku-5)/;
const FALLBACK_MODELS = /^claude-(fable-5-1|opus-5-5|opus-5$|sonnet-5-5)/;

async function anthropicChat(agent, messages, onToken) {
  let Anthropic;
  try { ({ default: Anthropic } = await import('@anthropic-ai/sdk')); } catch { throw new Error('AGENT=anthropic needs the SDK. Run: npm install'); }
  // With no key in .env the SDK falls back to ANTHROPIC_AUTH_TOKEN or an `ant auth login` profile.
  const client = new Anthropic(agent.apiKey ? { apiKey: agent.apiKey } : {});
  const params = { model: agent.model, max_tokens: 64000, system: SYSTEM, messages };
  if (EFFORT_MODELS.test(agent.model)) { params.thinking = { type: 'adaptive' }; params.output_config = { effort: 'high' }; }
  // A declined request is re-run on Anthropic's recommended fallback model instead of failing the video.
  const fallback = FALLBACK_MODELS.test(agent.model);
  try {
    const stream = fallback
      ? client.beta.messages.stream({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
      : client.messages.stream(params);
    stream.on('text', delta => onToken(delta.length));
    const message = await stream.finalMessage();
    if (message.stop_reason === 'refusal') throw new Error(`The model declined this topic${message.stop_details?.category ? ` (${message.stop_details.category})` : ''}.`);
    if (message.stop_reason === 'max_tokens') throw new Error('The reply was cut off at the output limit; ask for a shorter video.');
    const text = message.content.filter(block => block.type === 'text').map(block => block.text).join('');
    // Keep the full content (thinking blocks included) so follow-up turns stay valid.
    return { text, message: { role: 'assistant', content: message.content } };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) throw new Error('Anthropic rejected the credentials. Set ANTHROPIC_API_KEY in .env or run: ant auth login');
    if (error instanceof Anthropic.NotFoundError) throw new Error(`Anthropic does not know the model "${agent.model}". Check AGENT_MODEL.`);
    if (error instanceof Anthropic.RateLimitError) throw new Error('Anthropic rate limit reached; wait a moment and run again.');
    if (error instanceof Anthropic.APIConnectionError) throw new Error(`Cannot reach the Anthropic API: ${error.message}`);
    if (error instanceof Anthropic.APIError) throw new Error(`Anthropic API error ${error.status}: ${error.message}`);
    throw error;
  }
}

export const chat = (agent, messages, onToken = () => {}) => (agent.api === 'anthropic' ? anthropicChat : openaiChat)(agent, messages, onToken);

/** Pull `=== FILE: name ===` blocks out of a model reply. Tolerates reasoning tags and code fences. */
export function parseFiles(reply) {
  const body = reply.replace(/<think>[\s\S]*?<\/think>/g, '');
  const marker = /^[ \t]*={2,}\s*FILE:\s*(.+?)\s*={2,}[ \t]*$/gm;
  const marks = [...body.matchAll(marker)];
  const files = {};
  for (const [i, mark] of marks.entries()) {
    const name = mark[1].replace(/^[`'"]|[`'"]$/g, '').replace(/^\.\//, '');
    if (!/^[\w-]+\.(mjs|json|md)$/.test(name)) throw new Error(`Unexpected file name "${name}". Use video.json, scene-N.mjs, shared.mjs or sources.md.`);
    let content = body.slice(mark.index + mark[0].length, marks[i + 1]?.index ?? body.length);
    content = content.replace(/^[ \t]*={2,}\s*END\s*={2,}[\s\S]*$/m, '').trim();
    content = content.replace(/^```[\w-]*\n/, '').replace(/\n```\s*$/, '');
    files[name] = content + '\n';
  }
  if (!files['video.json']) throw new Error('The reply has no "=== FILE: video.json ===" block. Reply only with files in the required format.');
  return files;
}
