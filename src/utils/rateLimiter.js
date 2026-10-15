// Limitador simples em memória: `max` tentativas por `windowMs` por chave
export function createRateLimiter({ max, windowMs }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [key, list] of hits) {
      const recent = list.filter((t) => now - t < windowMs);
      if (recent.length) hits.set(key, recent);
      else hits.delete(key);
    }
  }, windowMs).unref();

  return (key) => {
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) return false;
    recent.push(now);
    hits.set(key, recent);
    return true;
  };
}
