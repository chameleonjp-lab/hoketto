import { describe, expect, it } from 'vitest';
import {
  TUTORIAL_STEP_COUNT,
  canStartSelection,
  chooseBoard,
  chooseDifficulty,
  createAppFlowState,
  nextTutorial,
  openTutorial,
  openSelection,
  returnHome,
  showResult,
  skipTutorial,
  startRematch,
  startGame,
} from '../../src/app/gameFlow';

describe('application flow', () => {
  it('起動時はホームを表示し、説明の進行位置を先頭にする', () => {
    const state = createAppFlowState();
    expect(state).toEqual({
      screen: 'HOME',
      tutorialStep: 0,
      selection: { board: 'straight-bench', difficulty: 'practice' },
      result: null,
    });
    expect(state.selection).not.toBe(createAppFlowState().selection);
  });

  it('ホームから基本説明を先頭で開く', () => {
    expect(openTutorial(createAppFlowState())).toEqual({
      screen: 'TUTORIAL',
      tutorialStep: 0,
      selection: { board: 'straight-bench', difficulty: 'practice' },
      result: null,
    });
  });

  it('基本説明を最後まで進めると試合へ移る', () => {
    let state = openTutorial(createAppFlowState());

    for (let index = 1; index < TUTORIAL_STEP_COUNT; index += 1) {
      state = nextTutorial(state);
      expect(state.screen).toBe('TUTORIAL');
      expect(state.tutorialStep).toBe(index);
    }

    expect(nextTutorial(state)).toEqual({
      screen: 'SELECT',
      tutorialStep: TUTORIAL_STEP_COUNT - 1,
      selection: { board: 'straight-bench', difficulty: 'practice' },
      result: null,
    });
  });

  it('説明を飛ばしても試合へ移れる', () => {
    expect(skipTutorial(openTutorial(createAppFlowState())).screen).toBe('SELECT');
  });

  it('すぐ遊ぶ、戻る、説明外の次へは安全に扱う', () => {
    const home = createAppFlowState();

    expect(startGame(openSelection(home)).screen).toBe('GAME');
    expect(startGame(home)).toBe(home);
    expect(nextTutorial(home)).toBe(home);
    expect(skipTutorial(home)).toBe(home);
    expect(returnHome()).toEqual({
      screen: 'HOME',
      tutorialStep: 0,
      selection: { board: 'straight-bench', difficulty: 'practice' },
      result: null,
    });
  });

  it('選択画面では開始可能な条件を判定し、選択を結果まで保持する', () => {
    const home = createAppFlowState();
    const selected = chooseDifficulty(chooseBoard(openSelection(home), 'twin-block'), 'normal');

    expect(selected.screen).toBe('SELECT');
    expect(canStartSelection(selected.selection)).toBe(false);
    expect(startGame(selected)).toBe(selected);
    expect(canStartSelection(home.selection)).toBe(true);
  });

  it('試合結果を表示し、同じ条件の再戦で試合へ戻る', () => {
    const game = startGame(openSelection(createAppFlowState()));
    const result = showResult(game, {
      playerScore: 2,
      cpuScore: 1,
      selection: { board: 'straight-bench', difficulty: 'practice' },
      winner: 'PLAYER',
      seed: 20260814,
    });

    expect(result.screen).toBe('RESULT');
    expect(result.result?.playerScore).toBe(2);
    expect(startRematch(result)).toEqual({
      screen: 'GAME',
      tutorialStep: 0,
      selection: { board: 'straight-bench', difficulty: 'practice' },
      result: null,
    });
    expect(startRematch(game)).toBe(game);
  });
});
