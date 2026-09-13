import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function startMatch(page: Page): Promise<void> {
  await page.goto('/');
  const playerName = page.locator('#player-name');
  await expect(page.locator('#play-button')).toBeDisabled();
  await playerName.fill('テストプレイヤー');
  await expect(page.locator('#play-button')).toBeEnabled();
  await page.locator('#play-button').click();
  await expect(page.locator('#selection-screen')).toBeVisible();
  await expect(page.locator('#mode-trial')).toHaveCount(0);
  await expect(page.locator('#mode-match')).toHaveCount(0);
  await expect(page.locator('.selection-static')).toContainText('90秒試合');
  await page.locator('#selection-start').click();
  await expect(page.locator('#game-screen')).toBeVisible();
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'GAME');
  await expect(page.locator('#game-root canvas')).toBeVisible();
}

async function startTraining(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('#player-name').fill('練習プレイヤー');
  await page.locator('#tutorial-button').click();
  await expect(page.locator('#tutorial-screen')).toBeVisible();
  await page.locator('#tutorial-practice').click();
  await expect(page.locator('#game-screen')).toBeVisible();
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'GAME');
  await expect(page.locator('#game-title')).toHaveText('射撃場');
  await expect(page.locator('#game-training-status')).toBeHidden();
  await expect(page.locator('#game-root canvas')).toBeVisible();
}

test.describe('ホケットのブラウザ導線', () => {
  test('説明から実際の物理を使う射撃場へ入り、ホームへ戻れる', async ({ page }) => {
    await startTraining(page);
    await page.locator('#home-button').click();
    await expect(page.locator('#home-screen')).toBeVisible();
    await expect(page.locator('#app')).toHaveAttribute('data-screen', 'HOME');
  });

  test('試合画面は盤面を最大化し、説明と状態カードを隠す', async ({ page }) => {
    await startMatch(page);

    await expect(page.locator('.game-quick-status')).toBeHidden();
    await expect(page.locator('.game-guide')).toBeHidden();
    await expect(page.locator('#game-root')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
    await expect(page.locator('#game-live-status')).toHaveText(/試合開始/);

    const viewportState = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>('#game-root')?.getBoundingClientRect();
      return {
        bodyOverflow: getComputedStyle(document.body).overflow,
        documentOverflow: getComputedStyle(document.documentElement).overflow,
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight,
        boardRatio: root ? root.width / root.height : 0,
      };
    });
    expect(viewportState.bodyOverflow).toBe('hidden');
    expect(viewportState.documentOverflow).toBe('hidden');
    expect(viewportState.scrollHeight).toBeLessThanOrEqual(viewportState.clientHeight + 2);
    expect(viewportState.boardRatio).toBeGreaterThan(0.54);
    expect(viewportState.boardRatio).toBeLessThan(0.59);
    expect(
      await page.locator('#game-root').evaluate((element) => element.getBoundingClientRect().width),
    ).toBeGreaterThan(330);

    await page.locator('#game-pause').click();
    await expect(page.locator('#game-live-status')).toHaveText(/一時停止/);
  });

  test('縮尺された盤面を押して離すと1発だけ発射できる', async ({ page }) => {
    await startMatch(page);
    const canvas = page.locator('#game-root canvas');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.78);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.62);
    await page.mouse.up();

    await expect(page.locator('#game-root')).toHaveAttribute('data-player-shot-count', '1', {
      timeout: 1_000,
    });
    await expect(page.locator('.game-quick-status')).toBeHidden();
  });

  test('ホームから試合へ入り、手動停止と明示再開を完了できる', async ({ page }) => {
    await startMatch(page);

    const pauseButton = page.locator('#game-pause');
    await pauseButton.click();
    await expect(pauseButton).toHaveText('再開');

    await pauseButton.click();
    await expect(pauseButton).toHaveText('再開中…');
    await expect(pauseButton).toHaveText('一時停止', { timeout: 5_000 });

    await page.locator('#home-button').click();
    await expect(page.locator('#home-screen')).toBeVisible();
    await expect(page.locator('#game-screen')).toBeHidden();
    await expect(page.locator('#app')).toHaveAttribute('data-screen', 'HOME');
  });

  test('画面非表示から戻っても、条件復帰だけでは自動再開しない', async ({ page }) => {
    await startMatch(page);

    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const pauseButton = page.locator('#game-pause');
    await expect(pauseButton).toHaveText('再開待ち…');

    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'visible',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(pauseButton).toHaveText('再開');

    await pauseButton.click();
    await expect(pauseButton).toHaveText('再開中…');
  });

  test('再開カウント中に中断しても、再開後に試合へ戻れる', async ({ page }) => {
    await startMatch(page);

    const pauseButton = page.locator('#game-pause');
    await pauseButton.click();
    await expect(pauseButton).toHaveText('再開');
    await pauseButton.click();
    await expect(pauseButton).toHaveText('再開中…');

    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(pauseButton).toHaveText('再開待ち…');

    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'visible',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(pauseButton).toHaveText('再開');
    await pauseButton.click();
    await expect(pauseButton).toHaveText('再開中…');
    await expect(pauseButton).toHaveText('一時停止', { timeout: 5_000 });
  });

  test('音設定を同じブラウザへ保存し、再訪時に復元する', async ({ page }) => {
    await page.goto('/');
    await page.locator('#settings-button').click();
    const effects = page.locator('#settings-effects');
    await expect(effects).not.toBeChecked();
    await effects.check();

    await page.reload();
    await page.locator('#settings-button').click();
    await expect(page.locator('#settings-effects')).toBeChecked();
    await expect(page.locator('#settings-music')).not.toBeChecked();
  });
});
