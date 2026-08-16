import { describe, expect, it } from 'vitest';
import {
  TUTORIAL_STEP_COUNT,
  canStartSelection,
  chooseBoard,
  chooseDifficulty,
  chooseGameMode,
  cancelTutorialAction,
  completeTutorialAction,
  createAppFlowState,
  nextTutorial,
  openTutorial,
  openSelection,
  returnHome,
  showResult,
  skipTutorial,
  startRematch,
  startGame,
  startTutorialAction,
} from '../../src/app/gameFlow';

describe('application flow', () => {
  it('起動時はホームを表示し、説明の進行位置を先頭にする', () => {
    const state = createAppFlowState();
    expect(state).toEqual({
      screen: 'HOME',
      tutorialStep: 0,
      tutorialActionStarted: false,
      tutorialActionCompleted: false,
      selection: { board: 'straight-bench', difficulty: 'practice', mode: 'match' },
      result: null,
    });
    expect(state.selection).not.toBe(createAppFlowState().selection);
  });

  it('ホームから基本説明を先頭で開く', () => {
    expect(openTutorial(createAppFlowState())).toEqual({
      screen: 'TUTORIAL',
      tutorialStep: 0,
      tutorialActionStarted: false,
      tutorialActionCompleted: false,
      selection: { board: 'straight-bench', difficulty: 'practice', mode: 'match' },
      result: null,
    });
  });

  it('基本説明を最後まで進めると試合へ移る', () => {
    let state = completeTutorialAction(openTutorial(createAppFlowState()));

    for (let index = 1; index < TUTORIAL_STEP_COUNT; index += 1) {
      if (state.tutorialStep === 1) {
        state = completeTutorialAction(startTutorialAction(state));
      }
      if (state.tutorialStep === 2) {
        state = completeTutorialAction(state);
      }
      state = nextTutorial(state);
      expect(state.screen).toBe('TUTORIAL');
      expect(state.tutorialStep).toBe(index);
      expect(state.tutorialActionCompleted).toBe(false);
    }

    state = completeTutorialAction(state);
    expect(nextTutorial(state)).toEqual({
      screen: 'SELECT',
      tutorialStep: TUTORIAL_STEP_COUNT - 1,
      tutorialActionStarted: false,
      tutorialActionCompleted: false,
      selection: { board: 'straight-bench', difficulty: 'practice', mode: 'match' },
      result: null,
    });
  });

  it('説明を飛ばしても試合へ移れる', () => {
    expect(skipTutorial(openTutorial(createAppFlowState())).screen).toBe('SELECT');
  });

  it('最初の説明は照準確認後にだけ進める', () => {
    const tutorial = openTutorial(createAppFlowState());

    expect(nextTutorial(tutorial)).toBe(tutorial);
    expect(completeTutorialAction(createAppFlowState())).toEqual(createAppFlowState());

    const completed = completeTutorialAction(tutorial);
    expect(completed.tutorialActionCompleted).toBe(true);
    expect(nextTutorial(completed).tutorialStep).toBe(1);
    expect(nextTutorial(completed).tutorialActionCompleted).toBe(false);
  });

  it('2番目の説明は押してから離した時だけ完了し、取消で戻る', () => {
    const stepOne = nextTutorial(completeTutorialAction(openTutorial(createAppFlowState())));

    expect(nextTutorial(stepOne)).toBe(stepOne);
    expect(completeTutorialAction(stepOne)).toBe(stepOne);

    const started = startTutorialAction(stepOne);
    expect(started.tutorialActionStarted).toBe(true);
    expect(completeTutorialAction(started)).toMatchObject({
      tutorialActionStarted: false,
      tutorialActionCompleted: true,
    });
    expect(nextTutorial(completeTutorialAction(started)).tutorialStep).toBe(2);
    const canceled = cancelTutorialAction(started);
    expect(canceled.tutorialActionStarted).toBe(false);
    expect(nextTutorial(canceled)).toBe(canceled);
  });

  it('3番目の説明は充電輪が満ちるまで進めず、待機後に選択へ移る', () => {
    const stepTwo = nextTutorial(
      completeTutorialAction(
        startTutorialAction(
          nextTutorial(completeTutorialAction(openTutorial(createAppFlowState()))),
        ),
      ),
    );

    expect(stepTwo.tutorialStep).toBe(2);
    expect(stepTwo.tutorialActionStarted).toBe(true);
    expect(nextTutorial(stepTwo)).toBe(stepTwo);

    const waited = completeTutorialAction(stepTwo);
    expect(waited).toMatchObject({
      tutorialActionStarted: false,
      tutorialActionCompleted: true,
    });
    expect(nextTutorial(waited).screen).toBe('SELECT');
    expect(cancelTutorialAction(stepTwo).tutorialActionStarted).toBe(false);
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
      tutorialActionStarted: false,
      tutorialActionCompleted: false,
      selection: { board: 'straight-bench', difficulty: 'practice', mode: 'match' },
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

    const normal = chooseDifficulty(openSelection(home), 'normal');
    expect(canStartSelection(normal.selection)).toBe(true);
    expect(startGame(normal).screen).toBe('GAME');

    const trial = chooseGameMode(home, 'trial');
    expect(trial.selection.mode).toBe('trial');
    expect(canStartSelection(trial.selection)).toBe(true);
  });

  it('試合結果を表示し、同じ条件の再戦で試合へ戻る', () => {
    const game = startGame(openSelection(createAppFlowState()));
    const result = showResult(game, {
      playerScore: 2,
      cpuScore: 1,
      selection: { board: 'straight-bench', difficulty: 'practice', mode: 'match' },
      winner: 'PLAYER',
      seed: 20260814,
    });

    expect(result.screen).toBe('RESULT');
    expect(result.result?.playerScore).toBe(2);
    expect(startRematch(result)).toEqual({
      screen: 'GAME',
      tutorialStep: 0,
      tutorialActionStarted: false,
      tutorialActionCompleted: false,
      selection: { board: 'straight-bench', difficulty: 'practice', mode: 'match' },
      result: null,
    });
    expect(startRematch(game)).toBe(game);
  });
});
