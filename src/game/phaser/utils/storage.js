const STORAGE_KEY = 'tank-game-meta-v1';

export function loadMetaState() {
  if (typeof window === 'undefined') {
    return { coins: 0, runs: 0 };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { coins: 0, runs: 0 };
    const parsed = JSON.parse(raw);
    return {
      coins: Number(parsed.coins || 0),
      runs: Number(parsed.runs || 0),
    };
  } catch {
    return { coins: 0, runs: 0 };
  }
}

export function saveMetaState(meta) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
}
