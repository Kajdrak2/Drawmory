import { expect, test, type BrowserContext, type Page } from '@playwright/test';

async function addStroke(page: Page) {
  const canvas = page.getByTestId('drawing-canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Drawing canvas is not visible.');
  await page.mouse.move(box.x + box.width * 0.34, box.y + box.height * 0.38);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.66, box.y + box.height * 0.62, { steps: 8 });
  await page.mouse.up();
}

test('a drawing travels through three anonymous carriers and reveals four frames', async ({
  browser,
}) => {
  let context: BrowserContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let page = await context.newPage();

  await page.goto('/');
  await page.getByRole('link', { name: /Create Start a new Drawmory/i }).click();
  await addStroke(page);
  await expect(page.getByRole('button', { name: /Continue/i })).toBeEnabled();
  await page.getByRole('button', { name: /Continue/i }).click();
  await page.getByTestId('launch-journey').click();
  await expect(page).toHaveURL(/\/pass\//);

  for (let step = 1; step <= 3; step += 1) {
    await page.getByTestId('private-handoff').click();
    const handoffUrl = await page.locator('.secret-link').innerText();

    const nextContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const nextPage = await nextContext.newPage();
    await nextPage.goto(handoffUrl);
    await nextPage.getByTestId('carry-it').click();
    await nextPage.getByTestId('start-reveal').click();

    await expect(nextPage.getByRole('img', { name: 'Drawing to remember' })).toBeVisible();
    await expect(nextPage.getByTestId('drawing-canvas')).toBeVisible({ timeout: 15_000 });
    await expect(nextPage.getByRole('img', { name: 'Drawing to remember' })).toHaveCount(0);

    await addStroke(nextPage);
    await nextPage.getByTestId('submit-redraw').click();

    if (step < 3) {
      await expect(nextPage).toHaveURL(/\/pass\//);
    } else {
      await expect(nextPage).toHaveURL(/\/journey\//);
      await expect(nextPage.getByRole('heading', { name: /See what the world remembered/i })).toBeVisible();
      await expect(nextPage.locator('.timeline-strip button')).toHaveCount(4);
    }

    await context.close();
    context = nextContext;
    page = nextPage;
  }

  await context.close();
});
