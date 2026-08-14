import './app/styles.css';
import {
  TUTORIAL_STEP_COUNT,
  TUTORIAL_STEPS,
  createAppFlowState,
  nextTutorial,
  openTutorial,
  returnHome,
  showResult,
  skipTutorial,
  startRematch,
  startGame,
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
const gameScreen = requireElement<HTMLElement>('#game-screen');
const gameRoot = requireElement<HTMLElement>('#game-root');
const tutorialStepLabel = requireElement<HTMLElement>('#tutorial-step-label');
const tutorialTitle = requireElement<HTMLElement>('#tutorial-title');
const tutorialBody = requireElement<HTMLElement>('#tutorial-body');
const playButton = requireElement<HTMLButtonElement>('#play-button');
const tutorialButton = requireElement<HTMLButtonElement>('#tutorial-button');
const tutorialNextButton = requireElement<HTMLButtonElement>('#tutorial-next');
const tutorialSkipButton = requireElement<HTMLButtonElement>('#tutorial-skip');
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
  gameScreen.hidden = flow.screen !== 'GAME';
  resultScreen.hidden = flow.screen !== 'RESULT';
  if (flow.screen !== 'RESULT') resetResultButtons();

  const step = TUTORIAL_STEPS[flow.tutorialStep];
  if (!step) throw new Error('基本説明の手順がありません');
  tutorialStepLabel.textContent = `基本説明 ${flow.tutorialStep + 1}/${TUTORIAL_STEP_COUNT}`;
  tutorialTitle.textContent = step.title;
  tutorialBody.textContent = step.body;
  tutorialNextButton.textContent =
    flow.tutorialStep === TUTORIAL_STEP_COUNT - 1 ? '試合を始める' : '次へ';

  const result = flow.result;
  if (result) {
    resultTitle.textContent =
      result.winner === 'PLAYER'
        ? '自分の勝ち'
        : result.winner === 'CPU'
          ? '相手の勝ち'
          : '引き分け';
    resultScore.textContent = `自分 ${result.playerScore}　｜　相手 ${result.cpuScore}`;
    resultDetail.textContent = '盤面：ストレート・ベンチ';
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
      onResult: handleGameResult,
    });
  }
}

function disposeGame(): void {
  game?.destroy(true);
  game = null;
}

function handleGameResult(result: TechnicalProbeResult): void {
  disposeGame();
  const nextFlow = showResult(flow, result);
  if (nextFlow === flow) return;
  flow = nextFlow;
  render();
  armResultButtons();
}

playButton.addEventListener('click', () => enterGame());

tutorialButton.addEventListener('click', () => {
  flow = openTutorial(flow);
  render();
  tutorialNextButton.focus();
});

tutorialNextButton.addEventListener('click', () => {
  flow = nextTutorial(flow);
  if (flow.screen === 'GAME') {
    enterGame();
    return;
  }
  render();
  tutorialNextButton.focus();
});

tutorialSkipButton.addEventListener('click', () => {
  flow = skipTutorial(flow);
  enterGame();
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
