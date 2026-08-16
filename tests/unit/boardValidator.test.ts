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
});
