import { describe, expect, it } from 'vitest';
import { RICOCHET_LANE, STRAIGHT_BENCH, TWIN_BLOCK } from '../../src/config/boards';
import { validateBoard } from '../../src/physics/boardValidator';

describe('board validator', () => {
  it('標準盤面を受け入れる', () => {
    expect(validateBoard(STRAIGHT_BENCH)).toEqual({ ok: true, errors: [] });
  });

  it('ツイン・ブロック盤面は対称な障害物と通路を受け入れる', () => {
    expect(validateBoard(TWIN_BLOCK)).toEqual({ ok: true, errors: [] });
  });

  it('リフレクト・レーン盤面は対称な反射板を受け入れる', () => {
    expect(validateBoard(RICOCHET_LANE)).toEqual({ ok: true, errors: [] });
  });

  it('コア候補が少ない盤面を拒否する', () => {
    const invalid = { ...STRAIGHT_BENCH, coreCandidates: [{ x: 180, y: 320 }] };
    const result = validateBoard(invalid);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('高出力コアの候補位置が3か所未満です');
  });

  it('上下の得点担当が反対の盤面を拒否する', () => {
    const invalid = {
      ...STRAIGHT_BENCH,
      goals: [
        { ...STRAIGHT_BENCH.goals[0], scoreFor: 'cpu' as const },
        STRAIGHT_BENCH.goals[1],
      ] as typeof STRAIGHT_BENCH.goals,
    };
    const result = validateBoard(invalid);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('上側ゴールはplayer、下側ゴールはcpuへ得点する必要があります');
  });

  it('自己申告の通路幅が実形状を上回る盤面を拒否する', () => {
    const invalid = { ...STRAIGHT_BENCH, minimumCorridor: 117 };
    const result = validateBoard(invalid);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('自己申告の通路幅が実測値を超えています');
  });

  it('標準境界から外れた盤面を拒否する', () => {
    const invalid = { ...STRAIGHT_BENCH, bounds: { ...STRAIGHT_BENCH.bounds, minX: 14 } };
    const result = validateBoard(invalid);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('盤面の境界は標準値(24,24)-(336,616)である必要があります');
  });

  it('候補ごとの安全なラウンドリセットがない盤面を拒否する', () => {
    const invalid = {
      ...STRAIGHT_BENCH,
      coreRoundResets: STRAIGHT_BENCH.coreRoundResets.filter((reset) => reset.candidateIndex !== 2),
    };
    const result = validateBoard(invalid);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('高出力コア候補ごとにコアリセットが1つ以上必要です');
  });
});
