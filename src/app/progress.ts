export interface PlayerProgress {
  readonly tutorialCompleted: boolean;
}

export type PlayerProgressLoadStatus = 'stored' | 'default' | 'recovered' | 'unavailable';

export interface PlayerProgressLoad {
  readonly progress: PlayerProgress;
  readonly status: PlayerProgressLoadStatus;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const PLAYER_PROGRESS_STORAGE_KEY = 'hoketto.progress.v1';

const DEFAULT_PLAYER_PROGRESS: PlayerProgress = { tutorialCompleted: false };

function getBrowserStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isPlayerProgress(value: unknown): value is PlayerProgress {
  if (!value || typeof value !== 'object') return false;
  return typeof (value as Partial<PlayerProgress>).tutorialCompleted === 'boolean';
}

export function loadPlayerProgress(
  storage: StorageLike | null = getBrowserStorage(),
): PlayerProgressLoad {
  if (!storage) return { progress: DEFAULT_PLAYER_PROGRESS, status: 'unavailable' };

  let raw: string | null;
  try {
    raw = storage.getItem(PLAYER_PROGRESS_STORAGE_KEY);
  } catch {
    return { progress: DEFAULT_PLAYER_PROGRESS, status: 'unavailable' };
  }
  if (raw === null) return { progress: DEFAULT_PLAYER_PROGRESS, status: 'default' };

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isPlayerProgress(parsed)) {
      return { progress: DEFAULT_PLAYER_PROGRESS, status: 'recovered' };
    }
    return { progress: parsed, status: 'stored' };
  } catch {
    return { progress: DEFAULT_PLAYER_PROGRESS, status: 'recovered' };
  }
}

export function savePlayerProgress(
  progress: PlayerProgress,
  storage: StorageLike | null = getBrowserStorage(),
): boolean {
  if (!storage || !isPlayerProgress(progress)) return false;
  try {
    storage.setItem(PLAYER_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}
