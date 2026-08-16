import { describe, expect, it } from 'vitest';
import {
  MAX_PLAY_RECORDS,
  PLAY_RECORDS_STORAGE_KEY,
  appendPlayRecord,
  formatPlayRecordsForCopy,
  loadPlayRecords,
  savePlayRecords,
  type PlayRecord,
} from '../../src/app/playRecords';
import type { GameResult } from '../../src/app/gameFlow';

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

const result: GameResult = {
  playerScore: 2,
  cpuScore: 1,
  selection: { board: 'straight-bench', difficulty: 'practice', mode: 'match' },
  winner: 'PLAYER',
  seed: 20260814,
};

describe('play records storage', () => {
  it('保存がない場合は空の初期値を返す', () => {
    expect(loadPlayRecords(new MemoryStorage())).toEqual({ records: [], status: 'default' });
  });

  it('試合結果を保存して同じブラウザの記録として復元する', () => {
    const storage = new MemoryStorage();
    const records = appendPlayRecord([], result);

    expect(savePlayRecords(records, storage)).toBe(true);
    expect(storage.getItem(PLAY_RECORDS_STORAGE_KEY)).not.toBeNull();
    expect(loadPlayRecords(storage)).toEqual({ records, status: 'stored' });
  });

  it('壊れた値と不正な記録を捨てて復旧扱いにする', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      PLAY_RECORDS_STORAGE_KEY,
      JSON.stringify([
        { ...result },
        { ...result, playerScore: 'bad' },
        { ...result, playerScore: 1000 },
        { ...result, selection: { ...result.selection, board: 'unknown' } },
        { ...result, seed: Number.POSITIVE_INFINITY },
      ]),
    );

    expect(loadPlayRecords(storage)).toEqual({
      records: [result],
      status: 'recovered',
    });
  });

  it('記録は新しい20件だけを残す', () => {
    const records: PlayRecord[] = Array.from({ length: MAX_PLAY_RECORDS + 3 }, (_, index) => ({
      ...result,
      seed: result.seed + index,
    }));

    expect(appendPlayRecord(records, { ...result, seed: 999999 })).toHaveLength(MAX_PLAY_RECORDS);
    expect(appendPlayRecord(records, { ...result, seed: 999999 })[0]?.seed).toBe(result.seed + 4);
  });

  it('保存領域の例外を試合停止にしない', () => {
    const storage = new FailingStorage();
    const records = appendPlayRecord([], result);

    expect(loadPlayRecords(storage).status).toBe('unavailable');
    expect(savePlayRecords(records, storage)).toBe(false);
  });

  it('コピー用の記録は個人情報を含まず、空でも説明できる', () => {
    expect(formatPlayRecordsForCopy([])).toContain('記録はありません');
    const text = formatPlayRecordsForCopy(appendPlayRecord([], result));

    expect(text).toContain('自分の勝ち');
    expect(text).toContain('ストレート・ベンチ');
    expect(text).not.toContain('20260814');
  });
});
