import { expect, test, type BrowserContext, type Page } from '@playwright/test';

async function addStroke(page: Page) {
  const canvas = page.getByTestId('drawing-canvas');
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await page.getByRole('button', { name: 'Brush', exact: true }).click();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Drawing canvas is not visible.');
  await page.mouse.move(box.x + box.width * 0.34, box.y + box.height * 0.38);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.66, box.y + box.height * 0.62, { steps: 8 });
  await page.mouse.up();
}

async function fillCanvas(page: Page) {
  const canvas = page.getByTestId('drawing-canvas');
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('button', { name: 'Fill', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Fill', exact: true }).click();
  await canvas.click({ position: { x: 120, y: 120 } });
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

  for (const tool of ['Brush', 'Marker', 'Fill', 'Line', 'Box', 'Circle', 'Erase']) {
    await expect(page.getByRole('button', { name: tool, exact: true })).toBeVisible();
  }
  await expect(page.getByLabel('Choose any color')).toBeVisible();
  await expect(page.getByLabel(/Opacity/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Fill shapes/ })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: /Fill shapes/ }).click();
  await expect(page.getByRole('button', { name: /Fill shapes/ })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Use color #ff6b55' }).click();
  await page.getByRole('button', { name: 'Fill', exact: true }).click();
  await page.getByTestId('drawing-canvas').click({ position: { x: 120, y: 120 } });
  await expect(page.getByRole('button', { name: /Continue/i })).toBeEnabled();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: /Continue/i })).toBeDisabled();
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(page.getByRole('button', { name: /Continue/i })).toBeEnabled();
});

test('the creator can choose an infinite custom loop without creating an invalid target', async ({ page }) => {
  await page.goto('/create');
  await fillCanvas(page);
  await expect(page.getByRole('button', { name: /Continue/i })).toBeEnabled();
  await page.getByRole('button', { name: /Continue/i }).click();
  await page.getByRole('radio', { name: /Open loop/i }).click();
  await expect(page.getByRole('radio', { name: /Open loop/i })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByLabel('Custom number of participants')).toHaveValue('');
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

test('a world journey keeps travelling automatically, stays public, inherits location and accepts votes', async ({
  browser,
}) => {
  const creatorContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const creator = await creatorContext.newPage();
  await creator.goto('/create');
  await fillCanvas(creator);
  await expect(creator.getByRole('button', { name: /Continue/i })).toBeEnabled();
  await creator.getByRole('button', { name: /Continue/i }).click();
  await creator.getByLabel('Custom number of participants').fill('3');
  await creator.getByLabel('Country', { exact: true }).selectOption('FR');
  await creator.getByRole('textbox', { name: 'City', exact: true }).fill('Paris');
  await creator.getByTestId('launch-journey').click();
  await expect(creator).toHaveURL(/\/pass\//);

  const publicSlug = await creator.evaluate(() => {
    const receipts = JSON.parse(localStorage.getItem('drawmoryReceipts') ?? '[]') as Array<{ publicSlug?: string }>;
    return receipts[0]?.publicSlug ?? '';
  });
  expect(publicSlug).not.toBe('');

  await creator.getByTestId('world-handoff').click();
  await expect(creator.getByText(/automatically return to the world/i)).toBeVisible();

  const firstCarrierContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const firstCarrier = await firstCarrierContext.newPage();
  await firstCarrier.goto('/receive');
  await firstCarrier.getByRole('button', { name: 'Receive from the world', exact: true }).click();
  await firstCarrier.getByTestId('carry-it').click();
  await firstCarrier.getByTestId('start-reveal').click();
  await expect(firstCarrier.getByTestId('drawing-canvas')).toBeVisible({ timeout: 15_000 });
  await addStroke(firstCarrier);
  await firstCarrier.getByTestId('submit-redraw').click();
  await expect(firstCarrier).toHaveURL(/\/receipt\//);
  await expect(firstCarrier.getByText(/returned to the world automatically/i)).toBeVisible();

  await firstCarrier.goto(`/journey/${publicSlug}`);
  await expect(firstCarrier.getByText('Journey in progress')).toBeVisible();
  await expect(firstCarrier.locator('.timeline-strip button')).toHaveCount(2);
  await expect(firstCarrier.getByRole('button', { name: 'Mural' })).toBeVisible();
  await firstCarrier.getByRole('button', { name: 'Mural' }).click();
  await expect(firstCarrier.locator('.mural-grid figure')).toHaveCount(2);
  await expect(firstCarrier.getByTestId('journey-map-point')).toHaveCount(2);
  await firstCarrier.getByTestId('vote-public').click();
  await expect(firstCarrier.getByTestId('vote-public')).toContainText('Voted');

  const ongoingResponse = await firstCarrier.request.get(`/api/public/journeys/${publicSlug}`);
  expect(ongoingResponse.ok()).toBeTruthy();
  const ongoing = await ongoingResponse.json() as {
    status: string;
    voteCount: number;
    drawings: Array<{ countryCode: string; city: string | null; locationPrecision: string }>;
  };
  expect(ongoing.status).toBe('AVAILABLE_WORLD');
  expect(ongoing.voteCount).toBeGreaterThan(0);
  expect(ongoing.drawings).toHaveLength(2);
  expect(ongoing.drawings.every((drawing) => drawing.countryCode === 'FR' && drawing.city === 'Paris')).toBeTruthy();
  expect(ongoing.drawings.every((drawing) => drawing.locationPrecision === 'COUNTRY')).toBeTruthy();

  await firstCarrier.goto('/');
  await firstCarrier.getByLabel('Status').selectOption('in_progress');
  await firstCarrier.getByLabel('Sort').selectOption('newest');
  const card = firstCarrier.locator('.library-section .journey-card').filter({ hasText: publicSlug.slice(0, 5).toUpperCase() });
  await expect(card).toBeVisible();
  await expect(card.getByRole('button', { name: 'Next drawing' })).toBeVisible();
  await expect(card.getByTestId(`vote-${publicSlug}`)).toBeVisible();

  const finalCarrierContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const finalCarrier = await finalCarrierContext.newPage();
  await finalCarrier.goto('/receive');
  await finalCarrier.getByRole('button', { name: 'Receive from the world', exact: true }).click();
  await finalCarrier.getByTestId('carry-it').click();
  await finalCarrier.getByTestId('start-reveal').click();
  await expect(finalCarrier.getByTestId('drawing-canvas')).toBeVisible({ timeout: 15_000 });
  await addStroke(finalCarrier);
  await finalCarrier.getByTestId('submit-redraw').click();
  await expect(finalCarrier).toHaveURL(new RegExp(`/journey/${publicSlug}$`));
  await expect(finalCarrier.locator('.timeline-strip button')).toHaveCount(3);

  const completedResponse = await finalCarrier.request.get(`/api/public/journeys/${publicSlug}`);
  const completed = await completedResponse.json() as { status: string; drawings: Array<{ city: string | null }> };
  expect(completed.status).toBe('COMPLETED');
  expect(completed.drawings).toHaveLength(3);
  expect(completed.drawings.every((drawing) => drawing.city === 'Paris')).toBeTruthy();

  await creatorContext.close();
  await firstCarrierContext.close();
  await finalCarrierContext.close();
});
