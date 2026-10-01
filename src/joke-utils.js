export const JOKE_API_URL = 'https://v2.jokeapi.dev/joke/Any?safe-mode';

export function normalizeJokeResponse(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Unexpected API response.');
  }

  if (payload.error) {
    throw new Error(payload.message || 'The joke service returned an error.');
  }

  if (payload.type === 'single' && typeof payload.joke === 'string' && payload.joke.trim()) {
    return {
      setup: '',
      delivery: payload.joke.trim(),
    };
  }

  if (
    payload.type === 'twopart' &&
    typeof payload.setup === 'string' &&
    typeof payload.delivery === 'string' &&
    payload.setup.trim() &&
    payload.delivery.trim()
  ) {
    return {
      setup: payload.setup.trim(),
      delivery: payload.delivery.trim(),
    };
  }

  return null;
}
