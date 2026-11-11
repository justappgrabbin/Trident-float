/**
 * Minimal OpenAI-compatible client for a local Qwen Coder server.
 *
 * Works with llama.cpp (`llama-server --jinja`), Ollama's OpenAI shim, or
 * LM Studio. No network calls happen unless `complete()` is invoked, so the
 * rest of the Computer loads with no model present.
 *
 * Environment:
 *   LOCAL_LLM_URL    default http://127.0.0.1:8080/v1
 *   LOCAL_LLM_MODEL  default qwen2.5-coder-7b-instruct
 *   LOCAL_LLM_KEY    optional bearer token
 */
export function createModelClient(options = {}) {
  const baseUrl = String(options.baseUrl ?? process.env.LOCAL_LLM_URL ?? 'http://127.0.0.1:8080/v1').replace(/\/+$/, '');
  const model = options.model ?? process.env.LOCAL_LLM_MODEL ?? 'qwen2.5-coder-7b-instruct';
  const apiKey = options.apiKey ?? process.env.LOCAL_LLM_KEY ?? '';
  const timeoutMs = options.timeoutMs ?? 120_000;
  const fetchImpl = options.fetch ?? globalThis.fetch;

  if (typeof fetchImpl !== 'function') throw new TypeError('createModelClient requires a fetch implementation');

  async function complete(messages, { tools, toolChoice = 'auto' } = {}) {
    if (!Array.isArray(messages) || messages.length === 0) throw new TypeError('messages must be a non-empty array');
    const body = { model, messages, temperature: 0.1, stream: false };
    if (tools?.length) { body.tools = tools; body.tool_choice = toolChoice; }

    let response;
    try {
      response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const reason = error?.name === 'TimeoutError' ? `no response within ${timeoutMs}ms` : String(error?.message ?? error);
      throw new Error(`Local model unreachable at ${baseUrl} (${reason}). Start the model server or set LOCAL_LLM_URL.`);
    }

    const text = await response.text();
    if (!response.ok) throw new Error(`Local model returned HTTP ${response.status}: ${text.slice(0, 500)}`);

    let json;
    try { json = JSON.parse(text); } catch { throw new Error(`Local model returned invalid JSON: ${text.slice(0, 200)}`); }
    const message = json?.choices?.[0]?.message;
    if (!message) throw new Error('Local model response had no choices[0].message');
    return { message, usage: json.usage ?? null, raw: json };
  }

  return { baseUrl, model, complete };
}
