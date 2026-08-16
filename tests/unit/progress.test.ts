import { describe, expect, it } from 'vitest';
import {
  PLAYER_PROGRESS_STORAGE_KEY,
  loadPlayerProgress,
  savePlayerProgress,
} from '../../src/app/progress';

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

describe('player progress storage', () => {
  it('保存がない場合は説明未完了を返す', () => {
    expect(loadPlayerProgress(new MemoryStorage())).toEqual({
      progress: { tutorialCompleted: false },
      status: 'default',
    });
  });

  it('説明完了を同じブラウザへ保存して復元する', () => {
    const storage = new MemoryStorage();
    const progress = { tutorialCompleted: true } as const;

    expect(savePlayerProgress(progress, storage)).toBe(true);
    expect(storage.getItem(PLAYER_PROGRESS_STORAGE_KEY)).not.toBeNull();
    expect(loadPlayerProgress(storage)).toEqual({ progress, status: 'stored' });
  });

  it('壊れた値や型違いは未完了へ戻して復旧扱いにする', () => {
    const storage = new MemoryStorage();
    storage.setItem(PLAYER_PROGRESS_STORAGE_KEY, JSON.stringify({ tutorialCompleted: 'yes' }));

    expect(loadPlayerProgress(storage)).toEqual({
      progress: { tutorialCompleted: false },
      status: 'recovered',
    });
  });

  it('JSONが壊れていても読み込みを止めない', () => {
    const storage = new MemoryStorage();
    storage.setItem(PLAYER_PROGRESS_STORAGE_KEY, '{broken');

    expect(loadPlayerProgress(storage).status).toBe('recovered');
  });

  it('保存領域の例外をゲーム停止にしない', () => {
    const storage = new FailingStorage();

    expect(loadPlayerProgress(storage).status).toBe('unavailable');
    expect(savePlayerProgress({ tutorialCompleted: true }, storage)).toBe(false);
  });

  it('不正な型を保存しない', () => {
    expect(
      savePlayerProgress(
        { tutorialCompleted: 'yes' } as unknown as { tutorialCompleted: boolean },
        new MemoryStorage(),
      ),
    ).toBe(false);
  });
});
