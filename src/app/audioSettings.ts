export interface AudioSettings {
  readonly effectsEnabled: boolean;
  readonly musicEnabled: boolean;
}

export type AudioSettingsLoadStatus = 'stored' | 'default' | 'recovered' | 'unavailable';

export interface AudioSettingsLoad {
  readonly settings: AudioSettings;
  readonly status: AudioSettingsLoadStatus;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const AUDIO_SETTINGS_STORAGE_KEY = 'hoketto.audio-settings.v1';

const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  effectsEnabled: false,
  musicEnabled: false,
};

function getBrowserStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isAudioSettings(value: unknown): value is AudioSettings {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AudioSettings>;
  return (
    typeof candidate.effectsEnabled === 'boolean' && typeof candidate.musicEnabled === 'boolean'
  );
}

export function loadAudioSettings(
  storage: StorageLike | null = getBrowserStorage(),
): AudioSettingsLoad {
  if (!storage) {
    return { settings: DEFAULT_AUDIO_SETTINGS, status: 'unavailable' };
  }

  let raw: string | null;
  try {
    raw = storage.getItem(AUDIO_SETTINGS_STORAGE_KEY);
  } catch {
    return { settings: DEFAULT_AUDIO_SETTINGS, status: 'unavailable' };
  }
  if (raw === null) return { settings: DEFAULT_AUDIO_SETTINGS, status: 'default' };

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isAudioSettings(parsed)) {
      return { settings: DEFAULT_AUDIO_SETTINGS, status: 'recovered' };
    }
    return { settings: parsed, status: 'stored' };
  } catch {
    return { settings: DEFAULT_AUDIO_SETTINGS, status: 'recovered' };
  }
}

export function saveAudioSettings(
  settings: AudioSettings,
  storage: StorageLike | null = getBrowserStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(AUDIO_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}
