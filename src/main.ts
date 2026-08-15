import './app/styles.css';
import {
  TUTORIAL_STEP_COUNT,
  TUTORIAL_STEPS,
  canStartSelection,
  chooseBoard,
  chooseDifficulty,
  chooseGameMode,
  createAppFlowState,
  nextTutorial,
  openTutorial,
  openSelection,
  returnHome,
  showResult,
  skipTutorial,
  startRematch,
  startGame,
  type BoardId,
  type DifficultyId,
  type GameModeId,
  type AppFlowState,
} from './app/gameFlow';
import { mountTechnicalProbe, type TechnicalProbeResult } from './game/TechnicalProbe';

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
const tutorialStepLabel = requireElement<HTMLElement>('#tutorial-step-label');
const tutorialTitle = requireElement<HTMLElement>('#tutorial-title');
const tutorialBody = requireElement<HTMLElement>('#tutorial-body');
const playButton = requireElement<HTMLButtonElement>('#play-button');
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
const resultRematchButton = requireElement<HTMLButtonElement>('#result-rematch');
const resultHomeButton = requireElement<HTMLButtonElement>('#result-home');

let flow: AppFlowState = createAppFlowState();
let game: ReturnType<typeof mountTechnicalProbe> | null = null;
let nextSeed = 20260814;
let resultButtonsTimer: number | null = null;

function resetResultButtons(): void {
  if (resultButtonsTimer !== null) {
    window.clearTimeout(resultButtonsTimer);
    resultButtonsTimer = null;
  }
  resultRematchButton.disabled = true;
  resultHomeButton.disabled = true;
}

function armResultButtons(): void {
  resetResultButtons();
  resultButtonsTimer = window.setTimeout(() => {
    resultButtonsTimer = null;
    if (flow.screen !== 'RESULT') return;
    resultRematchButton.disabled = false;
    resultHomeButton.disabled = false;
    resultRematchButton.focus();
  }, 300);
}

function render(): void {
  homeScreen.hidden = flow.screen !== 'HOME';
  tutorialScreen.hidden = flow.screen !== 'TUTORIAL';
  selectionScreen.hidden = flow.screen !== 'SELECT';
  gameScreen.hidden = flow.screen !== 'GAME';
  resultScreen.hidden = flow.screen !== 'RESULT';
  if (flow.screen !== 'RESULT') resetResultButtons();

  const step = TUTORIAL_STEPS[flow.tutorialStep];
  if (!step) throw new Error('基本説明の手順がありません');
  tutorialStepLabel.textContent = `基本説明 ${flow.tutorialStep + 1}/${TUTORIAL_STEP_COUNT}`;
  tutorialTitle.textContent = step.title;
  tutorialBody.textContent = step.body;
  tutorialNextButton.textContent =
    flow.tutorialStep === TUTORIAL_STEP_COUNT - 1 ? '条件を選ぶ' : '次へ';

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
  } else {
    resultTitle.textContent = '試合結果';
    resultScore.textContent = '';
    resultDetail.textContent = '';
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
  const nextFlow = showResult(flow, { ...result, selection: flow.selection });
  if (nextFlow === flow) return;
  flow = nextFlow;
  render();
  armResultButtons();
}

playButton.addEventListener('click', enterSelection);

tutorialButton.addEventListener('click', () => {
  flow = openTutorial(flow);
  render();
  tutorialNextButton.focus();
});

tutorialNextButton.addEventListener('click', () => {
  flow = nextTutorial(flow);
  if (flow.screen === 'SELECT') {
    render();
    selectionStartButton.focus();
    return;
  }
  render();
  tutorialNextButton.focus();
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

resultHomeButton.addEventListener('click', () => {
  disposeGame();
  flow = returnHome();
  render();
  playButton.focus();
});

window.addEventListener('pagehide', () => {
  disposeGame();
  resetResultButtons();
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
