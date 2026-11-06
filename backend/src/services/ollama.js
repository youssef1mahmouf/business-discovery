class OllamaError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'OllamaError';
    this.code = code;
  }
}

function modelNames(payload) {
  return Array.isArray(payload && payload.models)
    ? payload.models.map((model) => String(model.name || model.model || '')).filter(Boolean)
    : [];
}

function modelIsAvailable(configuredModel, availableModels) {
  const configured = String(configuredModel || '').trim();
  return availableModels.some((name) =>
    name === configured || name.startsWith(configured + ':'));
}

async function requestOllama(config, pathname, options = {}, fetchImpl = globalThis.fetch) {
  const baseUrl = String(config.ollamaBaseUrl || '').replace(/\/+$/, '');
  if (!baseUrl || typeof fetchImpl !== 'function') {
    throw new OllamaError('ollama_offline', 'Ollama is not configured.');
  }

  let response;
  try {
    response = await fetchImpl(baseUrl + pathname, {
      ...options,
      signal: AbortSignal.timeout(config.ollamaTimeoutMs || 45000)
    });
  } catch (error) {
    throw new OllamaError('ollama_offline', error && error.message || 'Ollama request failed.');
  }
  if (!response.ok) {
    throw new OllamaError('ollama_unavailable', 'Ollama returned HTTP ' + response.status + '.');
  }

  try {
    return await response.json();
  } catch {
    throw new OllamaError('invalid_ollama_response', 'Ollama returned invalid JSON.');
  }
}

async function getOllamaStatus(config, fetchImpl) {
  const model = String(config.ollamaModel || 'qwen3:4b');
  try {
    const payload = await requestOllama(config, '/api/tags', {}, fetchImpl);
    const models = modelNames(payload);
    const modelAvailable = modelIsAvailable(model, models);
    return {
      provider: 'ollama',
      model,
      reachable: true,
      modelAvailable,
      error: modelAvailable ? null : 'ollama_model_missing',
      authority: 'recommendations_only'
    };
  } catch (error) {
    return {
      provider: 'ollama',
      model,
      reachable: false,
      modelAvailable: false,
      error: error.code || 'ollama_unavailable',
      authority: 'recommendations_only'
    };
  }
}

async function chatWithOllama(config, messages, options = {}, fetchImpl) {
  const payload = await requestOllama(config, '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.ollamaModel || 'qwen3:4b',
      stream: false,
      ...(options.format ? { format: options.format } : {}),
      options: {
        temperature: options.temperature === undefined ? 0.3 : options.temperature,
        num_predict: options.numPredict || 1000
      },
      messages
    })
  }, fetchImpl);
  const content = payload && payload.message && payload.message.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new OllamaError('invalid_ollama_response', 'Ollama did not return a message.');
  }
  return content.trim();
}

module.exports = {
  OllamaError,
  chatWithOllama,
  getOllamaStatus,
  modelIsAvailable,
  requestOllama
};
