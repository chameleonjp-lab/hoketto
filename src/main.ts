import './app/styles.css';
import {
  TUTORIAL_STEP_COUNT,
  TUTORIAL_STEPS,
  createAppFlowState,
  nextTutorial,
  openTutorial,
  returnHome,
  skipTutorial,
  startGame,
  type AppFlowState,
} from './app/gameFlow';
import { mountTechnicalProbe } from './game/TechnicalProbe';

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

let flow: AppFlowState = createAppFlowState();
let game: ReturnType<typeof mountTechnicalProbe> | null = null;

function render(): void {
  homeScreen.hidden = flow.screen !== 'HOME';
  tutorialScreen.hidden = flow.screen !== 'TUTORIAL';
  gameScreen.hidden = flow.screen !== 'GAME';

  const step = TUTORIAL_STEPS[flow.tutorialStep];
  if (!step) throw new Error('基本説明の手順がありません');
  tutorialStepLabel.textContent = `基本説明 ${flow.tutorialStep + 1}/${TUTORIAL_STEP_COUNT}`;
  tutorialTitle.textContent = step.title;
  tutorialBody.textContent = step.body;
  tutorialNextButton.textContent =
    flow.tutorialStep === TUTORIAL_STEP_COUNT - 1 ? '試合を始める' : '次へ';
}

function enterGame(): void {
  flow = startGame(flow);
  render();
  if (!game) game = mountTechnicalProbe(gameRoot);
}

function disposeGame(): void {
  game?.destroy(true);
  game = null;
}

playButton.addEventListener('click', enterGame);

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

window.addEventListener('pagehide', disposeGame);

render();
