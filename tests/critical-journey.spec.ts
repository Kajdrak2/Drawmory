import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { haversineDistanceKm, measureJourney } from '../lib/journey-distance';
import { extraTranslations } from '../lib/i18n-extra';
import { languageOptions, translations } from '../lib/i18n';

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
  await expect(page.getByText(/A drawing travels from memory to memory/i)).toHaveCount(0);
  await expect(page.locator('.action-gesture')).toHaveCount(0);
  expect((await createLink.boundingBox())?.height).toBeLessThan(130);
  expect((await receiveLink.boundingBox())?.height).toBeLessThan(130);

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

test('journey distance follows consecutive geolocated steps without bridging gaps', () => {
  const acrossAntimeridian = haversineDistanceKm(
    { latitude: 0, longitude: 179 },
    { latitude: 0, longitude: -179 },
  );
  expect(acrossAntimeridian).not.toBeNull();
  expect(acrossAntimeridian!).toBeGreaterThan(220);
  expect(acrossAntimeridian!).toBeLessThan(225);

  const measured = measureJourney([
    { latitude: 48.8566, longitude: 2.3522, locationPrecision: 'PRECISE' },
    { latitude: 48.8566, longitude: 2.3522, locationPrecision: 'PRECISE' },
    { latitude: null, longitude: null, locationPrecision: 'NONE' },
    { latitude: 40.4168, longitude: -3.7038, locationPrecision: 'COUNTRY' },
  ]);
  expect(measured.distanceKm).toBe(0);
  expect(measured.approximate).toBe(false);
  expect(measureJourney([{ latitude: 48, longitude: 2 }]).distanceKm).toBeNull();
});

test('all selectable languages have a complete placeholder-safe catalogue', () => {
  const englishKeys = Object.keys(translations.en);
  for (const option of languageOptions) {
    if (option.code === 'en' || option.code === 'fr') continue;
    const catalogue = extraTranslations[option.code];
    const missing = englishKeys.filter((key) => !(key in catalogue));
    expect(missing, `${option.code} is missing translated messages`).toEqual([]);
    for (const key of englishKeys) {
      const placeholders = (translations.en[key as keyof typeof translations.en].match(/\{[^}]+\}/g) ?? []).sort();
      const translatedPlaceholders = (catalogue[key].match(/\{[^}]+\}/g) ?? []).sort();
      expect(translatedPlaceholders, `${option.code}.${key} changed placeholders`).toEqual(placeholders);
    }
  }
});

test('the language selector detects, persists and applies right-to-left languages', async ({ page }) => {
  await page.goto('/');
  const selector = page.locator('.language-select');
  await expect(selector.locator('option')).toHaveCount(10);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-GB');

  await selector.selectOption('es');
  await expect(page.getByRole('heading', { name: /Míralo.*Recuérdalo.*Redibújalo/i })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es-ES');
  await page.reload();
  await expect(selector).toHaveValue('es');
  await expect(selector).toHaveAttribute('aria-label', 'Idioma');

  await selector.selectOption('ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('link', { name: /إنشاء.*Drawmory/i })).toBeVisible();
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
    await expect(nextPage.getByTestId('location-step')).toBeVisible();
    await nextPage.getByTestId('skip-location').click();

    if (step < 3) {
      await expect(nextPage).toHaveURL(/\/pass\//);
    } else {
      await expect(nextPage).toHaveURL(/\/journey\//);
      await expect(nextPage.getByRole('heading', { name: /See what the world remembered/i })).toBeVisible();
      await expect(nextPage.locator('.timeline-strip button')).toHaveCount(5);
      await expect(nextPage.locator('.timeline-strip button').last()).toHaveAttribute('data-testid', 'journey-map-thumbnail');
      await nextPage.getByTestId('journey-map-thumbnail').click();
      await expect(nextPage.getByTestId('journey-map-slide')).toBeVisible();
      await expect(nextPage.getByText('No location has been shared for this journey yet.')).toBeVisible();

      const publicSlug = new URL(nextPage.url()).pathname.split('/').at(-1);
      if (!publicSlug) throw new Error('The completed journey has no public slug.');
      await nextPage.goto('/');
      await nextPage.getByLabel('Status').selectOption('completed');
      await nextPage.getByLabel('Sort').selectOption('newest');
      const library = nextPage.locator('.library-section');
      const publicCard = library.locator('.journey-card').filter({
        hasText: publicSlug.slice(0, 5).toUpperCase(),
      });
      await expect(publicCard).toBeVisible({ timeout: 15_000 });
      await expect(publicCard.locator('.frame-counter')).toHaveText('1/5');
      for (let index = 0; index < 4; index += 1) {
        await publicCard.getByRole('button', { name: 'Next drawing' }).click();
      }
      await expect(publicCard.locator('.frame-counter')).toHaveText('5/5');
      await expect(publicCard.getByTestId(`journey-card-map-${publicSlug}`)).toBeVisible();
      await expect(publicCard.getByText('No location has been shared for this journey yet.')).toBeVisible();
      const hallCard = nextPage.locator('.hall-section .journey-card').first();
      await expect(hallCard).toBeVisible({ timeout: 15_000 });
      const hallCounter = hallCard.locator('.frame-counter');
      const [hallCurrent, hallTotal] = (await hallCounter.innerText()).split('/').map(Number);
      for (let index = hallCurrent; index < hallTotal; index += 1) {
        await hallCard.getByRole('button', { name: 'Next drawing' }).click();
      }
      await expect(hallCounter).toHaveText(`${hallTotal}/${hallTotal}`);
      await expect(hallCard.locator('[data-testid^="journey-card-map-"]')).toBeVisible();
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
  await expect(firstCarrier.getByTestId('location-step')).toBeVisible();
  await expect(firstCarrier.getByRole('textbox', { name: 'City', exact: true })).toBeDisabled();
  await firstCarrier.getByTestId('skip-location').click();
  await expect(firstCarrier).toHaveURL(/\/receipt\//);
  await expect(firstCarrier.getByText(/returned to the world automatically/i)).toBeVisible();

  await firstCarrier.goto(`/journey/${publicSlug}`);
  await expect(firstCarrier.getByText('Journey in progress')).toBeVisible();
  await expect(firstCarrier.locator('.timeline-strip button')).toHaveCount(3);
  await expect(firstCarrier.locator('.timeline-strip button').last()).toHaveAttribute('data-testid', 'journey-map-thumbnail');
  await firstCarrier.locator('.timeline-strip button').nth(1).click();
  await firstCarrier.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(firstCarrier.getByTestId('journey-map-slide')).toBeVisible({ timeout: 4_000 });
  await expect(firstCarrier.getByRole('button', { name: 'Next drawing' })).toBeDisabled();
  await firstCarrier.getByRole('button', { name: 'Previous drawing' }).click();
  await expect(firstCarrier.getByRole('img', { name: 'Redraw 1' })).toBeVisible();
  await firstCarrier.getByTestId('journey-map-thumbnail').click();
  await expect(firstCarrier.getByTestId('journey-map-slide')).toBeVisible();
  await expect(firstCarrier.locator('.flipbook-map-slide .journey-map-canvas')).toBeVisible();
  await expect(firstCarrier.getByRole('button', { name: 'Mural' })).toBeVisible();
  await firstCarrier.getByRole('button', { name: 'Mural' }).click();
  await expect(firstCarrier.locator('.mural-grid figure')).toHaveCount(2);
  await expect(firstCarrier.getByTestId('journey-map-point')).toHaveCount(2);
  await firstCarrier.getByRole('button', { name: 'Book' }).click();
  await expect(firstCarrier.getByTestId('journey-map-slide')).toBeVisible();
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
  const nextPreview = card.getByRole('button', { name: 'Next drawing' });
  await expect(nextPreview).toBeVisible();
  await expect(card.locator('.frame-counter')).toHaveText('1/3');
  await nextPreview.click();
  await nextPreview.click();
  await expect(card.locator('.frame-counter')).toHaveText('3/3');
  await expect(card.getByTestId(`journey-card-map-${publicSlug}`)).toBeVisible();
  await expect(card.locator('.journey-map-canvas')).toBeVisible();
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
  await expect(finalCarrier.getByTestId('location-step')).toBeVisible();
  await finalCarrier.getByLabel('Country', { exact: true }).selectOption('ES');
  await finalCarrier.getByRole('textbox', { name: 'City', exact: true }).fill('Madrid');
  await finalCarrier.getByTestId('save-location').click();
  await expect(finalCarrier).toHaveURL(new RegExp(`/journey/${publicSlug}$`));
  await expect(finalCarrier.locator('.timeline-strip button')).toHaveCount(4);
  await expect(finalCarrier.locator('.timeline-strip button').last()).toHaveAttribute('data-testid', 'journey-map-thumbnail');

  const completedResponse = await finalCarrier.request.get(`/api/public/journeys/${publicSlug}`);
  const completed = await completedResponse.json() as {
    status: string;
    drawings: Array<{ countryCode: string; city: string | null }>;
  };
  expect(completed.status).toBe('COMPLETED');
  expect(completed.drawings).toHaveLength(3);
  expect(completed.drawings.slice(0, 2).every((drawing) => drawing.city === 'Paris')).toBeTruthy();
  expect(completed.drawings[2]).toMatchObject({ countryCode: 'ES', city: 'Madrid' });

  const distanceResponse = await finalCarrier.request.get('/api/public/journeys?status=all&sort=distance&limit=24');
  expect(distanceResponse.ok()).toBeTruthy();
  const distanceList = await distanceResponse.json() as {
    items: Array<{ publicSlug: string; distanceKm: number | null; distanceApproximate: boolean }>;
  };
  expect(distanceList.items[0]?.publicSlug).toBe(publicSlug);
  expect(distanceList.items[0]?.distanceKm).toBeGreaterThan(500);
  expect(distanceList.items[0]?.distanceApproximate).toBe(true);

  await finalCarrier.goto('/');
  await finalCarrier.getByLabel('Sort').selectOption('distance');
  const distanceCard = finalCarrier.locator('.library-section .journey-card').filter({
    hasText: publicSlug.slice(0, 5).toUpperCase(),
  });
  await expect(distanceCard).toBeVisible();
  await expect(distanceCard.locator('.journey-distance')).toContainText('km');

  await creatorContext.close();
  await firstCarrierContext.close();
  await finalCarrierContext.close();
});

test('ten-minute drawing logic opens a confirmation window, then releases the same step', async ({
  browser,
}) => {
  const creatorContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const creator = await creatorContext.newPage();
  await creator.goto('/create');
  await addStroke(creator);
  await creator.getByRole('button', { name: /Continue/i }).click();
  await creator.getByLabel('Custom number of participants').fill('2');
  await creator.getByTestId('launch-journey').click();
  await creator.getByTestId('private-handoff').click();
  const handoffUrl = await creator.locator('.secret-link').innerText();

  const carrierContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const carrier = await carrierContext.newPage();
  await carrier.goto(handoffUrl);
  await carrier.getByTestId('carry-it').click();
  await carrier.getByTestId('start-reveal').click();
  await expect(carrier.getByTestId('drawing-canvas')).toBeVisible({ timeout: 15_000 });
  await addStroke(carrier);

  const confirmation = carrier.getByTestId('validation-timeout');
  await expect(confirmation).toBeVisible({ timeout: 10_000 });
  await expect(confirmation.getByTestId('confirm-redraw')).toBeVisible();
  await expect(carrier.getByTestId('claim-expired')).toBeVisible({ timeout: 6_000 });

  const retryContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const retry = await retryContext.newPage();
  await retry.goto(handoffUrl);
  await expect(retry.getByTestId('carry-it')).toBeVisible({ timeout: 10_000 });
  await retry.getByTestId('carry-it').click();
  await retry.getByTestId('start-reveal').click();
  await expect(retry.getByTestId('drawing-canvas')).toBeVisible({ timeout: 15_000 });
  await addStroke(retry);
  await expect(retry.getByTestId('validation-timeout')).toBeVisible({ timeout: 10_000 });
  await retry.getByTestId('confirm-redraw').click();
  await expect(retry.getByTestId('location-step')).toBeVisible();
  await retry.getByTestId('skip-location').click();
  await expect(retry).toHaveURL(/\/journey\//);

  await creatorContext.close();
  await carrierContext.close();
  await retryContext.close();
});

test('the secret owner page can reset a drawing and permanently delete a Drawmory', async ({
  browser,
  request,
}) => {
  const invalidSession = await request.post('/api/admin/session', {
    data: { capability: 'wrong-capability-that-is-long-enough-0123456789' },
  });
  expect(invalidSession.status()).toBe(401);

  const creatorContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const creator = await creatorContext.newPage();
  await creator.goto('/create');
  await addStroke(creator);
  await creator.getByRole('button', { name: /Continue/i }).click();
  await creator.getByLabel('Custom number of participants').fill('2');
  await creator.getByTestId('launch-journey').click();
  await creator.getByTestId('private-handoff').click();
  const handoffUrl = await creator.locator('.secret-link').innerText();
  const publicSlug = await creator.evaluate(() => {
    const receipts = JSON.parse(localStorage.getItem('drawmoryReceipts') ?? '[]') as Array<{ publicSlug?: string }>;
    return receipts[0]?.publicSlug ?? '';
  });
  expect(publicSlug).not.toBe('');

  const carrierContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const carrier = await carrierContext.newPage();
  await carrier.goto(handoffUrl);
  await carrier.getByTestId('carry-it').click();

  const adminContext = await browser.newContext({ viewport: { width: 1180, height: 900 } });
  const admin = await adminContext.newPage();
  await admin.goto('/manage#access=test-admin-capability-0123456789abcdef-0123456789abcdef');
  await expect(admin).toHaveURL(/\/manage$/);
  await expect(admin.getByRole('heading', { name: 'Administration' })).toBeVisible();
  const card = admin.getByTestId(`admin-journey-${publicSlug}`);
  await expect(card).toBeVisible();
  admin.once('dialog', (dialog) => dialog.accept());
  await card.getByTestId(`admin-release-${publicSlug}`).click();
  await expect(card.getByText('Disponible en privé')).toBeVisible();

  await carrier.goto(handoffUrl);
  await carrier.getByTestId('carry-it').click();
  await carrier.getByTestId('start-reveal').click();
  await expect(carrier.getByTestId('drawing-canvas')).toBeVisible({ timeout: 15_000 });
  await addStroke(carrier);
  await carrier.getByTestId('submit-redraw').click();
  await expect(carrier.getByTestId('location-step')).toBeVisible();
  await carrier.getByTestId('skip-location').click();
  await expect(carrier).toHaveURL(/\/journey\//);
  await admin.getByRole('button', { name: 'Actualiser' }).click();
  await expect(card.locator('.admin-drawings figure')).toHaveCount(2);

  admin.once('dialog', (dialog) => dialog.accept());
  await card.getByTestId(`admin-reset-${publicSlug}-1`).click();
  await expect(card.locator('.admin-drawings figure')).toHaveCount(1);
  await expect(admin.getByText(/Nouveau lien de transmission privé/)).toBeVisible();

  const resetResponse = await admin.request.get(`/api/public/journeys/${publicSlug}`);
  expect(resetResponse.ok()).toBeTruthy();
  const resetJourney = await resetResponse.json() as { status: string; drawings: unknown[] };
  expect(resetJourney.status).toBe('AWAITING_HANDOFF');
  expect(resetJourney.drawings).toHaveLength(1);

  admin.once('dialog', (dialog) => dialog.accept(publicSlug));
  await card.getByTestId(`admin-delete-${publicSlug}`).click();
  await expect(admin.getByTestId(`admin-journey-${publicSlug}`)).toHaveCount(0);
  const deletedResponse = await admin.request.get(`/api/public/journeys/${publicSlug}`);
  expect(deletedResponse.status()).toBe(404);

  await creatorContext.close();
  await carrierContext.close();
  await adminContext.close();
});
