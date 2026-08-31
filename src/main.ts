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
import {
  mountTechnicalProbe,
  toggleTechnicalProbePause,
  type TechnicalProbeResult,
  type TechnicalProbePauseState,
} from './game/TechnicalProbe';
import { SoundController } from './audio/sound';
import { loadAudioSettings, saveAudioSettings } from './app/audioSettings';
import {
  appendPlayRecord,
  formatPlayRecordsForCopy,
  loadPlayRecords,
  savePlayRecords,
} from './app/playRecords';
import { loadPlayerProgress, savePlayerProgress } from './app/progress';

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`ホケットの画面要素がありません: ${selector}`);
  return element;
}

const homeScreen = requireElement<HTMLElement>('#home-screen');
const homeProgressNote = requireElement<HTMLElement>('#home-progress-note');
const tutorialScreen = requireElement<HTMLElement>('#tutorial-screen');
const selectionScreen = requireElement<HTMLElement>('#selection-screen');
const gameScreen = requireElement<HTMLElement>('#game-screen');
const gameBoardLabel = requireElement<HTMLElement>('#game-board-label');
const gameRoot = requireElement<HTMLElement>('#game-root');
const gameLiveStatus = requireElement<HTMLElement>('#game-live-status');
const gamePauseButton = requireElement<HTMLButtonElement>('#game-pause');
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
const resultPlayer = requireElement<HTMLElement>('#result-player');
const resultDetail = requireElement<HTMLElement>('#result-detail');
const resultShareText = requireElement<HTMLTextAreaElement>('#result-share-text');
const resultShareButton = requireElement<HTMLButtonElement>('#result-share');
const resultShareStatus = requireElement<HTMLElement>('#result-share-status');
const homeShareButton = requireElement<HTMLButtonElement>('#home-share');
const homeShareStatus = requireElement<HTMLElement>('#home-share-status');
const playerNameInput = requireElement<HTMLInputElement>('#player-name');
const playerNameNote = requireElement<HTMLElement>('#player-name-note');
const rankingList = requireElement<HTMLOListElement>('#ranking-list');
const rankingStatus = requireElement<HTMLElement>('#ranking-status');
const resultRecordNote = requireElement<HTMLElement>('#result-record-note');
const resultRecordExport = requireElement<HTMLElement>('#result-record-export');
const resultRematchButton = requireElement<HTMLButtonElement>('#result-rematch');
const resultCopyButton = requireElement<HTMLButtonElement>('#result-copy');
const resultHomeButton = requireElement<HTMLButtonElement>('#result-home');

const SUPABASE_URL = 'https://mlpnjgezrnhdxsxolyzj.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_drzcy0v97knU6FgjqSgBHw_0A9XPdFM';
const GAME_SLUG = 'hoketto';
const CLIENT_VERSION = 'hoketto-2026-08-31';

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
const loadedPlayerProgress = loadPlayerProgress();
let tutorialCompleted = loadedPlayerProgress.progress.tutorialCompleted;
let progressPersistenceWarning =
  loadedPlayerProgress.status === 'unavailable'
    ? '基本説明の完了をこの端末へ保存できません。ゲームはそのまま遊べます。'
    : loadedPlayerProgress.status === 'recovered'
      ? '保存された基本説明の状態を読み直せなかったため、未完了へ戻しました。'
      : '';
let nextSeed = 20260814;
let resultButtonsTimer: number | null = null;
let tutorialWaitTimer: number | null = null;
let resultShareNote = '';
let homeShareNote = '';
let playerName = loadPlayerName();
let rankingLoadKey = '';

interface RankingRow {
  readonly rank_no?: number;
  readonly display_name?: string;
  readonly player_name?: string;
  readonly score?: number;
  readonly best_score?: number;
}

function loadPlayerName(): string {
  try {
    return (window.localStorage.getItem('hoketto-player-name') ?? '').trim().slice(0, 20);
  } catch {
    return '';
  }
}

function savePlayerName(value: string): void {
  try {
    window.localStorage.setItem('hoketto-player-name', value);
  } catch {
    // Private browsing may disable storage; the current session still works.
  }
}

function currentGameUrl(): string {
  return window.location.href.split('#')[0] ?? window.location.href;
}

function homeShareMessage(): string {
  return `ホケット｜弾でパックを動かす縦画面スポーツゲーム\n${currentGameUrl()}\n#カメレオンJP #ホケット`;
}

function resultShareMessage(
  result: TechnicalProbeResult,
  selection: AppFlowState['selection'],
): string {
  const winner =
    result.winner === 'PLAYER' ? '自分の勝ち' : result.winner === 'CPU' ? '相手の勝ち' : '引き分け';
  return `ホケットで${winner}！\n自分 ${result.playerScore} - 相手 ${result.cpuScore}\n${boardLabel(selection.board)}／${difficultyLabel(selection.difficulty)}／${modeLabel(selection.mode)}\n${currentGameUrl()}\n#カメレオンJP #ホケット`;
}

async function shareOrCopy(message: string): Promise<'shared' | 'copied' | 'manual'> {
  try {
    if (typeof navigator.share === 'function') {
      await navigator.share({ title: 'ホケット', text: message });
      return 'shared';
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'manual';
  }
  try {
    if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
    await navigator.clipboard.writeText(message);
    return 'copied';
  } catch {
    return 'manual';
  }
}

async function supabaseRpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error('ranking request failed');
  return data as T;
}

function renderRanking(rows: RankingRow[]): void {
  rankingList.replaceChildren();
  if (rows.length === 0) {
    const item = document.createElement('li');
    item.textContent = 'まだ記録がありません。';
    rankingList.append(item);
    return;
  }
  rows.slice(0, 10).forEach((row, index) => {
    const item = document.createElement('li');
    const name = row.display_name ?? row.player_name ?? 'ななし';
    const score = Number(row.score ?? row.best_score ?? 0);
    item.textContent = `${row.rank_no ?? index + 1}位　${name}　${score}点`;
    rankingList.append(item);
  });
}

async function submitAndLoadRanking(result: TechnicalProbeResult): Promise<void> {
  const key = `${result.seed}:${result.playerScore}:${result.cpuScore}`;
  if (rankingLoadKey === key) return;
  rankingLoadKey = key;
  rankingStatus.textContent = 'ランキング送信中…';
  try {
    await supabaseRpc('submit_score', {
      p_display_name: playerName,
      p_game_slug: GAME_SLUG,
      p_score: Math.trunc(result.playerScore),
      p_client_version: CLIENT_VERSION,
    });
    const rows = await supabaseRpc<RankingRow[]>('get_best_score_ranking', {
      p_game_slug: GAME_SLUG,
      p_limit: 10,
    });
    renderRanking(Array.isArray(rows) ? rows : []);
    rankingStatus.textContent = 'ランキングを更新しました。';
  } catch {
    rankingStatus.textContent = 'ランキングを取得できませんでした。ゲーム結果は保存されています。';
  }
}

function renderPlayerNameState(): void {
  if (playerNameInput.value !== playerName) playerNameInput.value = playerName;
  playerNameNote.textContent =
    playerName.length > 0
      ? `${playerName}さんの名前でランキングに参加します。`
      : '名前を入力するとゲームを開始できます。';
  playButton.disabled = playerName.length === 0;
  selectionStartButton.disabled = !canStartSelection(flow.selection) || playerName.length === 0;
  homeShareStatus.textContent = homeShareNote;
}

function updatePauseButton(state: TechnicalProbePauseState): void {
  gamePauseButton.disabled =
    state.phase === 'resuming' ||
    state.phase === 'invalid' ||
    (state.phase === 'paused' && !state.canResume);
  gamePauseButton.textContent =
    state.phase === 'invalid'
      ? '復元できません'
      : state.phase === 'paused'
        ? state.canResume
          ? '再開'
          : '再開待ち…'
        : state.phase === 'resuming'
          ? '再開中…'
          : '一時停止';
  updateGameLiveStatusForPause(state);
}

function updateGameLiveStatus(message: string): void {
  gameLiveStatus.textContent = message;
}

function pauseReasonMessage(reason: TechnicalProbePauseState['reason']): string {
  if (reason === 'lag') return '処理遅延を検知したため、試合を止めました。';
  if (reason === 'manual') return '試合を一時停止しました。';
  if (reason === 'hidden') return '画面が非表示になったため、試合を止めました。';
  if (reason === 'orientation') return '画面の向きが変わったため、試合を止めました。';
  if (reason === 'resize') return '画面の大きさが変わったため、試合を止めました。';
  if (reason === 'render-loss') return '描画を復元するため、試合を止めました。';
  return '試合を中断しました。';
}

function updateGameLiveStatusForPause(state: TechnicalProbePauseState): void {
  if (state.phase === 'invalid') {
    updateGameLiveStatus(
      '描画を復元できないため、試合を無効にしました。ホームへ戻ってやり直してください。',
    );
    return;
  }
  if (state.phase === 'resuming') {
    updateGameLiveStatus('試合を再開しています。3秒待ってください。');
    return;
  }
  if (state.phase !== 'paused') return;
  updateGameLiveStatus(
    `${pauseReasonMessage(state.reason)}${state.canResume ? '再開を押してください。' : '再開条件を確認しています。'}`,
  );
}

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
  resultShareButton.disabled = true;
  resultCopyButton.disabled = true;
  resultHomeButton.disabled = true;
}

function armResultButtons(): void {
  resetResultButtons();
  resultButtonsTimer = window.setTimeout(() => {
    resultButtonsTimer = null;
    if (flow.screen !== 'RESULT') return;
    resultRematchButton.disabled = false;
    resultShareButton.disabled = false;
    resultCopyButton.disabled = false;
    resultHomeButton.disabled = false;
    resultRematchButton.focus();
  }, 300);
}

function render(): void {
  renderPlayerNameState();
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
  tutorialButton.textContent = tutorialCompleted ? '説明をもう一度' : '説明を見る';
  homeProgressNote.textContent = [
    tutorialCompleted ? '基本説明は完了しています。必要なら説明をもう一度見られます。' : '',
    progressPersistenceWarning,
  ]
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
  gameBoardLabel.textContent = boardLabel(selection.board);
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
  selectionStartButton.disabled = !canStartSelection(selection) || playerName.length === 0;

  const result = flow.result;
  if (result) {
    resultTitle.textContent =
      result.winner === 'PLAYER'
        ? '自分の勝ち'
        : result.winner === 'CPU'
          ? '相手の勝ち'
          : '引き分け';
    resultScore.textContent = `自分 ${result.playerScore}　｜　相手 ${result.cpuScore}`;
    resultPlayer.textContent = `プレイヤー：${playerName || 'ななし'}`;
    resultDetail.textContent = `盤面：${boardLabel(result.selection.board)}　｜　CPU：${difficultyLabel(result.selection.difficulty)}　｜　${modeLabel(result.selection.mode)}`;
    resultShareText.value = resultShareMessage(result, result.selection);
    resultShareStatus.textContent = resultShareNote;
    resultRecordNote.textContent = [recordPersistenceWarning, recordCopyNote]
      .filter(Boolean)
      .join(' ');
    resultRecordExport.textContent = formatPlayRecordsForCopy(playRecords);
  } else {
    resultTitle.textContent = '試合結果';
    resultScore.textContent = '';
    resultPlayer.textContent = '';
    resultDetail.textContent = '';
    resultShareText.value = '';
    resultShareStatus.textContent = '';
    resultRecordNote.textContent = '';
    resultRecordExport.textContent = '';
  }
}

function enterGame(seed = nextSeed): void {
  if (!playerName) {
    playerNameNote.textContent = 'プレイヤー名を入力してください。';
    playerNameInput.focus();
    return;
  }
  nextSeed = seed + 1;
  flow = startGame(flow);
  render();
  updateGameLiveStatus('試合開始。下から弾を撃ち、白いパックを上の相手ゴールへ入れます。');
  if (!game) {
    game = mountTechnicalProbe(gameRoot, {
      seed,
      durationSeconds: flow.selection.mode === 'trial' ? 30 : 90,
      difficulty: flow.selection.difficulty,
      board:
        flow.selection.board === 'twin-block'
          ? 'twin-block'
          : flow.selection.board === 'ricochet-lane'
            ? 'ricochet-lane'
            : 'straight-bench',
      onResult: handleGameResult,
      onShot: (owner) => {
        soundController.playShot(owner);
        if (owner === 'player') {
          updateGameLiveStatus('自分が弾を発射しました。充電が戻るまで待ちます。');
        }
      },
      onGoal: (team, scores) => {
        soundController.playGoal(team);
        const side = team === 'player' ? '自分' : '相手';
        updateGameLiveStatus(
          `${side}が得点しました。現在、自分 ${scores.playerScore}、相手 ${scores.cpuScore}。`,
        );
      },
      onPauseChange: updatePauseButton,
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
  updatePauseButton({ phase: 'playing', canResume: false });
}

function handleGameResult(result: TechnicalProbeResult): void {
  updateGameLiveStatus(`試合終了。自分 ${result.playerScore}、相手 ${result.cpuScore}。`);
  disposeGame();
  const completedResult = { ...result, selection: flow.selection };
  playRecords = appendPlayRecord(playRecords, completedResult);
  recordPersistenceWarning = savePlayRecords(playRecords)
    ? ''
    : '試遊記録をこの端末へ保存できません。試合はそのまま遊べます。';
  recordCopyNote = '';
  resultShareNote = '';
  const nextFlow = showResult(flow, completedResult);
  if (nextFlow === flow) return;
  flow = nextFlow;
  render();
  armResultButtons();
  void submitAndLoadRanking(result);
}

playerNameInput.value = playerName;
playerNameInput.addEventListener('input', () => {
  playerName = playerNameInput.value.trim().slice(0, 20);
  playerNameInput.value = playerName;
  savePlayerName(playerName);
  renderPlayerNameState();
});

homeShareButton.addEventListener('click', async () => {
  const outcome = await shareOrCopy(homeShareMessage());
  homeShareNote =
    outcome === 'shared'
      ? '共有シートを開きました。'
      : outcome === 'copied'
        ? 'ゲームのリンクをコピーしました。'
        : '共有できませんでした。リンクを選択して共有してください。';
  renderPlayerNameState();
  homeShareButton.focus();
});

playButton.addEventListener('click', enterSelection);

gamePauseButton.addEventListener('click', () => {
  if (game) toggleTechnicalProbePause(game);
});

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
    tutorialCompleted = true;
    progressPersistenceWarning = savePlayerProgress({ tutorialCompleted: true })
      ? ''
      : '基本説明の完了をこの端末へ保存できません。ゲームはそのまま遊べます。';
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

resultShareButton.addEventListener('click', async () => {
  const result = flow.result;
  if (!result) return;
  const outcome = await shareOrCopy(resultShareMessage(result, result.selection));
  resultShareNote =
    outcome === 'shared'
      ? '共有シートを開きました。'
      : outcome === 'copied'
        ? '結果文をコピーしました。'
        : '自動共有できません。上の文章を選択してコピーしてください。';
  render();
  resultShareButton.focus();
});

resultHomeButton.addEventListener('click', () => {
  disposeGame();
  flow = returnHome();
  render();
  playButton.focus();
});

window.addEventListener('pagehide', (event) => {
  clearTutorialWaitTimer();
  resetResultButtons();
  if (event.persisted) return;
  disposeGame();
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
