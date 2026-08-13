import './app/styles.css';
import { mountTechnicalProbe } from './game/TechnicalProbe';

const gameRoot = document.querySelector<HTMLElement>('#game-root');

if (!gameRoot) {
  throw new Error('技術試作の表示先がありません');
}

const game = mountTechnicalProbe(gameRoot);
window.addEventListener('pagehide', () => game.destroy(true));
