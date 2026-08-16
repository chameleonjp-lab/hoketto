import './app/styles.css';
import {
  TUTORIAL_STEP_COUNT,
  TUTORIAL_STEPS,
  TUTORIAL_WAIT_MS,
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
  startTutorialAction,
  startGame,
  type BoardId,
  type DifficultyId,
  type GameModeId,
  type AppFlowState,
} from './app/gameFlow';
import { mountTechnicalProbe, type TechnicalProbeResult } from './game/TechnicalProbe';
import { SoundController } from './audio/sound';
import { loadAudioSettings, saveAudioSettings } from './app/audioSettings';
import {
  appendPlayRecord,
  formatPlayRecordsForCopy,
  loadPlayRecords,
  savePlayRecords,
} from './app/playRecords';

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`ホケットの画面要素がありません: ${selector}`);
  return element;
}

const homeScreen = requireElement<HTMLElement>('#home-screen');
const tutorialScreen = requireElement<HTMLElement>('#tutorial-screen');
const selectionScreen = requireElement<HTMLElement>('#selection-screen');
const gameScreen = requireElement<HTMLElement>('#game-screen');
const gameRoot = requireElement<HTMLElement>('#game-root');
const settingsScreen = requireElement<HTMLElement>('#settings-screen');
const tutorialStepLabel = requireElement<HTMLElement>('#tutorial-step-label');
const tutorialTitle = requireElement<HTMLElement>('#tutorial-title');
const tutorialBody = requireElement<HTMLElement>('#tutorial-body');
const tutorialFeedback = requireElement<HTMLElement>('#tutorial-feedback');
const tutorialTarget = requireElement<HTMLButtonElement>('#tutorial-target');
const tutorialChargeRing = requireElement<HTMLElement>('#tutorial-charge-ring');
const playButton = requireElement<HTMLButtonElement>('#play-button');
const settingsButton = requireElement<HTMLButtonElement>('#settings-button');
const settingsEffects = requireElement<HTMLInputElement>('#settings-effects');
const settingsMusic = requireElement<HTMLInputElement>('#settings-music');
const settingsAudioNote = requireElement<HTMLElement>('#settings-audio-note');
const settingsBack = requireElement<HTMLButtonElement>('#settings-back');
const tutorialButton = requireElement<HTMLButtonElement>('#tutorial-button');
const tutorialNextButton = requireElement<HTMLButtonElement>('#tutorial-next');
const tutorialSkipButton = requireElement<HTMLButtonElement>('#tutorial-skip');
const boardStraightButton = requireElement<HTMLButtonElement>('#board-straight');
const boardTwinButton = requireElement<HTMLButtonElement>('#board-twin');
const boardRicochetButton = requireElement<HTMLButtonElement>('#board-ricochet');
const difficultyPracticeButton = requireElement<HTMLButtonElement>('#difficulty-practice');
const difficultyNormalButton = requireElement<HTMLButtonElement>('#difficulty-normal');
const modeTrialButton = requireElement<HTMLButtonElement>('#mode-trial');
const modeMatchButton = requireElement<HTMLButtonElement>('#mode-match');
const selectionStartButton = requireElement<HTMLButtonElement>('#selection-start');
const selectionBackButton = requireElement<HTMLButtonElement>('#selection-back');
const homeButton = requireElement<HTMLButtonElement>('#home-button');
const resultScreen = requireElement<HTMLElement>('#result-screen');
const resultTitle = requireElement<HTMLElement>('#result-title');
const resultScore = requireElement<HTMLElement>('#result-score');
const resultDetail = requireElement<HTMLElement>('#result-detail');
const resultRecordNote = requireElement<HTMLElement>('#result-record-note');
const resultRecordExport = requireElement<HTMLElement>('#result-record-export');
const resultRematchButton = requireElement<HTMLButtonElement>('#result-rematch');
const resultCopyButton = requireElement<HTMLButtonElement>('#result-copy');
const resultHomeButton = requireElement<HTMLButtonElement>('#result-home');

let flow: AppFlowState = createAppFlowState();
let game: ReturnType<typeof mountTechnicalProbe> | null = null;
const soundController = new SoundController();
const loadedAudioSettings = loadAudioSettings();
soundController.applySettings(loadedAudioSettings.settings);
let settingsOpen = false;
let settingsPersistenceWarning =
  loadedAudioSettings.status === 'unavailable'
    ? '音設定をこの端末へ保存できません。ゲームはそのまま遊べます。'
    : loadedAudioSettings.status === 'recovered'
      ? '保存された音設定を読み直せなかったため、無音に戻しました。'
      : '';
const loadedPlayRecords = loadPlayRecords();
let playRecords = [...loadedPlayRecords.records];
let recordPersistenceWarning =
  loadedPlayRecords.status === 'unavailable'
    ? '試遊記録をこの端末へ保存できません。試合はそのまま遊べます。'
    : loadedPlayRecords.status === 'recovered'
      ? '保存された試遊記録の一部を読み直せなかったため、破棄しました。'
      : '';
let recordCopyNote = '';
let nextSeed = 20260814;
let resultButtonsTimer: number | null = null;
let tutorialWaitTimer: number | null = null;

function clearTutorialWaitTimer(): void {
  if (tutorialWaitTimer !== null) {
    window.clearTimeout(tutorialWaitTimer);
    tutorialWaitTimer = null;
  }
}

function resetResultButtons(): void {
  if (resultButtonsTimer !== null) {
    window.clearTimeout(resultButtonsTimer);
    resultButtonsTimer = null;
  }
  resultRematchButton.disabled = true;
  resultCopyButton.disabled = true;
  resultHomeButton.disabled = true;
}

function armResultButtons(): void {
  resetResultButtons();
  resultButtonsTimer = window.setTimeout(() => {
    resultButtonsTimer = null;
    if (flow.screen !== 'RESULT') return;
    resultRematchButton.disabled = false;
    resultCopyButton.disabled = false;
    resultHomeButton.disabled = false;
    resultRematchButton.focus();
  }, 300);
}

function render(): void {
  homeScreen.hidden = settingsOpen || flow.screen !== 'HOME';
  tutorialScreen.hidden = settingsOpen || flow.screen !== 'TUTORIAL';
  selectionScreen.hidden = settingsOpen || flow.screen !== 'SELECT';
  gameScreen.hidden = settingsOpen || flow.screen !== 'GAME';
  resultScreen.hidden = settingsOpen || flow.screen !== 'RESULT';
  settingsScreen.hidden = !settingsOpen;
  if (flow.screen !== 'RESULT') resetResultButtons();

  settingsEffects.checked = soundController.areEffectsEnabled;
  settingsMusic.checked = soundController.isMusicEnabled;
  const audioSupportNote = soundController.isSupported
    ? '音声はこの端末で利用できます。'
    : 'このブラウザでは音声を利用できません。ゲームはそのまま遊べます。';
  settingsAudioNote.textContent = [audioSupportNote, settingsPersistenceWarning]
    .filter(Boolean)
    .join(' ');
  soundController.setMusicActive(!settingsOpen && flow.screen === 'GAME');

  const step = TUTORIAL_STEPS[flow.tutorialStep];
  if (!step) throw new Error('基本説明の手順がありません');
  tutorialStepLabel.textContent = `基本説明 ${flow.tutorialStep + 1}/${TUTORIAL_STEP_COUNT}`;
  tutorialTitle.textContent = step.title;
  tutorialBody.textContent = step.body;
  tutorialTarget.hidden = flow.tutorialStep > 1;
  tutorialTarget.disabled = flow.tutorialStep > 1 || flow.tutorialActionCompleted;
  tutorialTarget.textContent = flow.tutorialStep === 1 ? '押して離す' : 'ここをタップ';
  tutorialTarget.setAttribute(
    'aria-label',
    flow.tutorialStep === 1
      ? '白いパックへ向けて押してから指を離す'
      : '白いパックをタップして照準を試す',
  );
  tutorialFeedback.textContent =
    flow.tutorialStep === 0
      ? flow.tutorialActionCompleted
        ? '照準できました。次へ進みます。'
        : '白いパックを1回タップしてください。'
      : flow.tutorialStep === 1
        ? flow.tutorialActionCompleted
          ? '発射できました。次へ進みます。'
          : flow.tutorialActionStarted
            ? 'そのまま指を離してください。'
            : 'ボタンを押してから、指を離してください。'
        : flow.tutorialStep === 2
          ? flow.tutorialActionCompleted
            ? '待てました。次の画面へ進みます。'
            : '充電輪が満ちるまで待ちます。'
          : '';
  tutorialNextButton.disabled =
    (flow.tutorialStep === 0 || flow.tutorialStep === 1 || flow.tutorialStep === 2) &&
    !flow.tutorialActionCompleted;
  tutorialNextButton.textContent =
    flow.tutorialStep === TUTORIAL_STEP_COUNT - 1 ? '条件を選ぶ' : '次へ';

  const waitingForTutorialCharge =
    flow.screen === 'TUTORIAL' &&
    flow.tutorialStep === 2 &&
    flow.tutorialActionStarted &&
    !flow.tutorialActionCompleted;
  tutorialChargeRing.hidden = !waitingForTutorialCharge;
  tutorialChargeRing.classList.toggle('is-waiting', waitingForTutorialCharge);
  if (!waitingForTutorialCharge) {
    clearTutorialWaitTimer();
  } else if (tutorialWaitTimer === null) {
    tutorialWaitTimer = window.setTimeout(() => {
      tutorialWaitTimer = null;
      if (
        flow.screen !== 'TUTORIAL' ||
        flow.tutorialStep !== 2 ||
        !flow.tutorialActionStarted ||
        flow.tutorialActionCompleted
      ) {
        return;
      }
      flow = completeTutorialAction(flow);
      render();
      tutorialNextButton.focus();
    }, TUTORIAL_WAIT_MS);
  }

  const selection = flow.selection;
  const boardButtons: readonly [HTMLButtonElement, BoardId][] = [
    [boardStraightButton, 'straight-bench'],
    [boardTwinButton, 'twin-block'],
    [boardRicochetButton, 'ricochet-lane'],
  ];
  for (const [button, board] of boardButtons) {
    const selected = selection.board === board;
    button.setAttribute('aria-pressed', String(selected));
    button.classList.toggle('is-selected', selected);
  }
  const difficultyButtons: readonly [HTMLButtonElement, DifficultyId][] = [
    [difficultyPracticeButton, 'practice'],
    [difficultyNormalButton, 'normal'],
  ];
  for (const [button, difficulty] of difficultyButtons) {
    const selected = selection.difficulty === difficulty;
    button.setAttribute('aria-pressed', String(selected));
    button.classList.toggle('is-selected', selected);
  }
  const modeButtons: readonly [HTMLButtonElement, GameModeId][] = [
    [modeTrialButton, 'trial'],
    [modeMatchButton, 'match'],
  ];
  for (const [button, mode] of modeButtons) {
    const selected = selection.mode === mode;
    button.setAttribute('aria-pressed', String(selected));
    button.classList.toggle('is-selected', selected);
  }
  selectionStartButton.disabled = !canStartSelection(selection);

  const result = flow.result;
  if (result) {
    resultTitle.textContent =
      result.winner === 'PLAYER'
        ? '自分の勝ち'
        : result.winner === 'CPU'
          ? '相手の勝ち'
          : '引き分け';
    resultScore.textContent = `自分 ${result.playerScore}　｜　相手 ${result.cpuScore}`;
    resultDetail.textContent = `盤面：${boardLabel(result.selection.board)}　｜　CPU：${difficultyLabel(result.selection.difficulty)}　｜　${modeLabel(result.selection.mode)}`;
    resultRecordNote.textContent = [recordPersistenceWarning, recordCopyNote]
      .filter(Boolean)
      .join(' ');
    resultRecordExport.textContent = formatPlayRecordsForCopy(playRecords);
  } else {
    resultTitle.textContent = '試合結果';
    resultScore.textContent = '';
    resultDetail.textContent = '';
    resultRecordNote.textContent = '';
    resultRecordExport.textContent = '';
  }
}

function enterGame(seed = nextSeed): void {
  nextSeed = seed + 1;
  flow = startGame(flow);
  render();
  if (!game) {
    game = mountTechnicalProbe(gameRoot, {
      seed,
      durationSeconds: flow.selection.mode === 'trial' ? 30 : 90,
      onResult: handleGameResult,
      onShot: (owner) => soundController.playShot(owner),
      onGoal: (team) => soundController.playGoal(team),
    });
  }
}

function enterSelection(): void {
  flow = openSelection(flow);
  render();
  selectionStartButton.focus();
}

function disposeGame(): void {
  game?.destroy(true);
  game = null;
}

function handleGameResult(result: TechnicalProbeResult): void {
  disposeGame();
  const completedResult = { ...result, selection: flow.selection };
  playRecords = appendPlayRecord(playRecords, completedResult);
  recordPersistenceWarning = savePlayRecords(playRecords)
    ? ''
    : '試遊記録をこの端末へ保存できません。試合はそのまま遊べます。';
  recordCopyNote = '';
  const nextFlow = showResult(flow, completedResult);
  if (nextFlow === flow) return;
  flow = nextFlow;
  render();
  armResultButtons();
}

playButton.addEventListener('click', enterSelection);

settingsButton.addEventListener('click', () => {
  settingsOpen = true;
  render();
  settingsEffects.focus();
});

settingsBack.addEventListener('click', () => {
  settingsOpen = false;
  render();
  playButton.focus();
});

settingsEffects.addEventListener('change', () => {
  soundController.setEffectsEnabled(settingsEffects.checked);
  settingsPersistenceWarning = saveAudioSettings({
    effectsEnabled: settingsEffects.checked,
    musicEnabled: settingsMusic.checked,
  })
    ? ''
    : '音設定をこの端末へ保存できません。ゲームはそのまま遊べます。';
  render();
  settingsEffects.focus();
});

settingsMusic.addEventListener('change', () => {
  soundController.setMusicEnabled(settingsMusic.checked);
  settingsPersistenceWarning = saveAudioSettings({
    effectsEnabled: settingsEffects.checked,
    musicEnabled: settingsMusic.checked,
  })
    ? ''
    : '音設定をこの端末へ保存できません。ゲームはそのまま遊べます。';
  render();
  settingsMusic.focus();
});

tutorialButton.addEventListener('click', () => {
  flow = openTutorial(flow);
  render();
  tutorialTarget.focus();
});

function finishTutorialAction(): void {
  flow = completeTutorialAction(flow);
  render();
  tutorialNextButton.focus();
}

tutorialTarget.addEventListener('pointerdown', (event) => {
  if (flow.tutorialStep !== 1) return;
  tutorialTarget.setPointerCapture(event.pointerId);
  flow = startTutorialAction(flow);
  render();
});

tutorialTarget.addEventListener('pointerup', (event) => {
  if (flow.tutorialStep !== 1) return;
  if (tutorialTarget.hasPointerCapture(event.pointerId)) {
    tutorialTarget.releasePointerCapture(event.pointerId);
  }
  finishTutorialAction();
});

tutorialTarget.addEventListener('pointercancel', (event) => {
  if (flow.tutorialStep !== 1) return;
  if (tutorialTarget.hasPointerCapture(event.pointerId)) {
    tutorialTarget.releasePointerCapture(event.pointerId);
  }
  flow = cancelTutorialAction(flow);
  render();
});

tutorialTarget.addEventListener('click', () => {
  if (flow.tutorialStep === 0) {
    finishTutorialAction();
    return;
  }
  if (flow.tutorialStep === 1 && !flow.tutorialActionCompleted) {
    flow = startTutorialAction(flow);
    finishTutorialAction();
  }
});

tutorialNextButton.addEventListener('click', () => {
  flow = nextTutorial(flow);
  if (flow.screen === 'SELECT') {
    render();
    selectionStartButton.focus();
    return;
  }
  render();
  if (flow.tutorialStep <= 1) {
    tutorialTarget.focus();
  } else {
    tutorialNextButton.focus();
  }
});

tutorialSkipButton.addEventListener('click', () => {
  flow = skipTutorial(flow);
  render();
  selectionStartButton.focus();
});

boardStraightButton.addEventListener('click', () => {
  flow = chooseBoard(flow, 'straight-bench');
  render();
  selectionStartButton.focus();
});

boardTwinButton.addEventListener('click', () => {
  flow = chooseBoard(flow, 'twin-block');
  render();
});

boardRicochetButton.addEventListener('click', () => {
  flow = chooseBoard(flow, 'ricochet-lane');
  render();
});

difficultyPracticeButton.addEventListener('click', () => {
  flow = chooseDifficulty(flow, 'practice');
  render();
  selectionStartButton.focus();
});

difficultyNormalButton.addEventListener('click', () => {
  flow = chooseDifficulty(flow, 'normal');
  render();
});

modeTrialButton.addEventListener('click', () => {
  flow = chooseGameMode(flow, 'trial');
  render();
  selectionStartButton.focus();
});

modeMatchButton.addEventListener('click', () => {
  flow = chooseGameMode(flow, 'match');
  render();
  selectionStartButton.focus();
});

selectionStartButton.addEventListener('click', () => {
  if (!canStartSelection(flow.selection)) return;
  enterGame();
});

selectionBackButton.addEventListener('click', () => {
  flow = returnHome();
  render();
  playButton.focus();
});

homeButton.addEventListener('click', () => {
  disposeGame();
  flow = returnHome();
  render();
  playButton.focus();
});

resultRematchButton.addEventListener('click', () => {
  const result = flow.result;
  if (!result) return;
  flow = startRematch(flow);
  enterGame(result.seed + 1);
});

resultCopyButton.addEventListener('click', async () => {
  if (!flow.result) return;
  try {
    if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
    await navigator.clipboard.writeText(formatPlayRecordsForCopy(playRecords));
    if (flow.screen !== 'RESULT') return;
    recordCopyNote = '試遊記録をコピーしました。';
  } catch {
    if (flow.screen !== 'RESULT') return;
    recordCopyNote = '自動コピーできません。下の記録を選択してコピーしてください。';
  }
  render();
  resultCopyButton.focus();
});

resultHomeButton.addEventListener('click', () => {
  disposeGame();
  flow = returnHome();
  render();
  playButton.focus();
});

window.addEventListener('pagehide', () => {
  disposeGame();
  clearTutorialWaitTimer();
  resetResultButtons();
  soundController.dispose();
});

render();

function boardLabel(board: BoardId): string {
  if (board === 'straight-bench') return 'ストレート・ベンチ';
  if (board === 'twin-block') return 'ツイン・ブロック';
  return 'リフレクト・レーン';
}

function difficultyLabel(difficulty: DifficultyId): string {
  return difficulty === 'practice' ? 'れんしゅう' : 'ふつう';
}

function modeLabel(mode: GameModeId): string {
  return mode === 'trial' ? '30秒の試し撃ち' : '90秒試合';
}
