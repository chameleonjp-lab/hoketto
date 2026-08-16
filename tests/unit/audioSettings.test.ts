import { describe, expect, it } from 'vitest';
import {
  AUDIO_SETTINGS_STORAGE_KEY,
  loadAudioSettings,
  saveAudioSettings,
  type AudioSettings,
} from '../../src/app/audioSettings';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

class FailingStorage {
  public getItem(): string {
    throw new Error('storage unavailable');
  }

  public setItem(): void {
    throw new Error('storage unavailable');
  }
}

describe('audio settings storage', () => {
  it('保存がない場合は無音の初期値を返す', () => {
    const loaded = loadAudioSettings(new MemoryStorage());

    expect(loaded.status).toBe('default');
    expect(loaded.settings).toEqual({ effectsEnabled: false, musicEnabled: false });
  });

  it('同じ保存領域へ保存した設定を復元する', () => {
    const storage = new MemoryStorage();
    const settings: AudioSettings = { effectsEnabled: true, musicEnabled: false };

    expect(saveAudioSettings(settings, storage)).toBe(true);
    expect(storage.getItem(AUDIO_SETTINGS_STORAGE_KEY)).not.toBeNull();
    expect(loadAudioSettings(storage)).toEqual({ settings, status: 'stored' });
  });

  it('壊れた保存値は無音へ戻して復旧扱いにする', () => {
    const storage = new MemoryStorage();
    storage.setItem(AUDIO_SETTINGS_STORAGE_KEY, '{broken');

    expect(loadAudioSettings(storage)).toEqual({
      settings: { effectsEnabled: false, musicEnabled: false },
      status: 'recovered',
    });
  });

  it('保存領域の例外をゲーム停止にしない', () => {
    const storage = new FailingStorage();

    expect(loadAudioSettings(storage).status).toBe('unavailable');
    expect(saveAudioSettings({ effectsEnabled: true, musicEnabled: true }, storage)).toBe(false);
  });
});
