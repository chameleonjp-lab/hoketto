import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function startTrial(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('#play-button').click();
  await expect(page.locator('#selection-screen')).toBeVisible();
  await page.locator('#mode-trial').click();
  await page.locator('#selection-start').click();
  await expect(page.locator('#game-screen')).toBeVisible();
  await expect(page.locator('#game-root canvas')).toBeVisible();
}

test.describe('ホケットのブラウザ導線', () => {
  test('ホームから試合へ入り、手動停止と明示再開を完了できる', async ({ page }) => {
    await startTrial(page);

    const pauseButton = page.locator('#game-pause');
    await pauseButton.click();
    await expect(pauseButton).toHaveText('再開');

    await pauseButton.click();
    await expect(pauseButton).toHaveText('再開中…');
    await expect(pauseButton).toHaveText('一時停止', { timeout: 5_000 });

    await page.locator('#home-button').click();
    await expect(page.locator('#home-screen')).toBeVisible();
    await expect(page.locator('#game-screen')).toBeHidden();
  });

  test('画面非表示から戻っても、条件復帰だけでは自動再開しない', async ({ page }) => {
    await startTrial(page);

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
