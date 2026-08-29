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

test('the home screen shows and opens every starting route on mobile', async ({ page }) => {
  await page.goto('/');

  const createLink = page.getByRole('link', { name: /Create Start a new Drawmory/i });
  const receiveLink = page.getByRole('link', { name: /Receive Continue a Drawmory/i });
  const howLink = page.getByRole('link', { name: 'How it works', exact: true });

  await expect(createLink).toBeInViewport();
  await expect(receiveLink).toBeInViewport();
  await expect(howLink).toBeInViewport();
  await expect(howLink).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Drawmory library' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Hall of Fame' })).toBeVisible();
  await expect(page.getByText('No account. No login. No email.')).toHaveCount(0);
  await expect(page.getByText('Your Drawmories on this device')).toHaveCount(0);

  await howLink.click();
  await expect(page).toHaveURL(/\/how-it-works$/);
  await expect(page.getByRole('heading', { name: /One look\. One memory/i })).toBeVisible();

  await page.goto('/');
  await page.getByRole('link', { name: /Receive Continue a Drawmory/i }).click();
  await expect(page).toHaveURL(/\/receive$/);
  await expect(page.getByRole('heading', { name: /Continue a Drawmory/i })).toBeVisible();

  await page.goto('/');
  await page.getByRole('link', { name: /Create Start a new Drawmory/i }).click();
  await expect(page).toHaveURL(/\/create$/);
  await expect(page.getByRole('heading', { name: /Draw the first version/i })).toBeVisible();
});

test('the drawing studio supports fill, shapes, undo and redo', async ({ page }) => {
  await page.goto('/create');

  for (const tool of ['Brush', 'Fill', 'Line', 'Box', 'Circle', 'Erase']) {
    await expect(page.getByRole('button', { name: tool, exact: true })).toBeVisible();
  }

  await page.getByRole('button', { name: 'Use color #ff6b55' }).click();
  await page.getByRole('button', { name: 'Fill', exact: true }).click();
  await page.getByTestId('drawing-canvas').click({ position: { x: 120, y: 120 } });
  await expect(page.getByRole('button', { name: /Continue/i })).toBeEnabled();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: /Continue/i })).toBeDisabled();
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(page.getByRole('button', { name: /Continue/i })).toBeEnabled();
});

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

      const publicSlug = new URL(nextPage.url()).pathname.split('/').at(-1);
      if (!publicSlug) throw new Error('The completed journey has no public slug.');
      await nextPage.goto('/');
      await nextPage.getByLabel('Status').selectOption('completed');
      await nextPage.getByLabel('Sort').selectOption('newest');
      const library = nextPage.locator('.library-section');
      const voteButton = library.getByTestId(`vote-${publicSlug}`);
      await expect(voteButton).toBeVisible({ timeout: 15_000 });
      await voteButton.click();
      await expect(voteButton).toContainText('Voted');
      await expect(voteButton).toBeDisabled();

      await nextPage.reload();
      await nextPage.getByLabel('Status').selectOption('completed');
      await nextPage.getByLabel('Sort').selectOption('newest');
      await expect(library.getByTestId(`vote-${publicSlug}`)).toContainText('Voted');
      await expect(library.getByTestId(`vote-${publicSlug}`)).toBeDisabled();
    }

    await context.close();
    context = nextContext;
    page = nextPage;
  }

  await context.close();
});
