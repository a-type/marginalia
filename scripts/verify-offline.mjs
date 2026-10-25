import assert from 'node:assert/strict';
import { mkdir, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';

const origin = process.env.BASE_URL ?? 'http://127.0.0.1:7656';
const output = `${tmpdir()}/margins-offline-verification`;
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
});
const page = await context.newPage();
const failures = [];
page.on('pageerror', (error) => failures.push(error.message));
const bibleRequests = [];
context.on('request', (request) => {
  if (new URL(request.url()).pathname.startsWith('/usfm/'))
    bibleRequests.push(new URL(request.url()).pathname);
});

async function records() {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('margins-translations');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const request = db
          .transaction('translations')
          .objectStore('translations')
          .getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  });
}

async function waitReady(id) {
  await page.evaluate(
    (translationId) =>
      new Promise((resolve, reject) => {
        const channel = new BroadcastChannel('margins-translations');
        const timeout = setTimeout(() => {
          channel.close();
          reject(new Error('Translation preparation timed out'));
        }, 120_000);
        const check = () => {
          const opening = indexedDB.open('margins-translations');
          opening.onsuccess = () => {
            const db = opening.result;
            if (!db.objectStoreNames.contains('translations')) {
              db.close();
              return;
            }
            const request = db
              .transaction('translations')
              .objectStore('translations')
              .get(translationId);
            request.onsuccess = () => {
              db.close();
              if (request.result?.searchStatus === 'ready') {
                clearTimeout(timeout);
                channel.close();
                resolve();
              } else if (request.result?.error) {
                clearTimeout(timeout);
                channel.close();
                reject(new Error(request.result.error));
              }
            };
          };
        };
        channel.onmessage = check;
        check();
      }),
    id,
  );
}

async function settings() {
  await page.getByRole('button', { name: 'User menu' }).click();
  await page.getByRole('menuitem', { name: 'Settings', exact: true }).click();
  await page
    .getByRole('heading', { name: 'Translations', exact: true })
    .waitFor();
}

async function openLocation() {
  await page.getByRole('button', { name: /, Chapter \d+$/ }).click();
}

async function selectTranslation(name) {
  await openLocation();
  await page
    .getByRole('combobox', { name: 'Translation', exact: true })
    .click();
  await page.getByRole('option', { name }).click();
}

async function selectBook(name) {
  await openLocation();
  await page
    .getByRole('group', { name: 'Book', exact: true })
    .getByRole('button', { name, exact: true })
    .click();
}

async function noOverflow() {
  const widths = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }));
  assert.ok(widths.document <= widths.viewport + 1, JSON.stringify(widths));
  for (const dialog of await page.getByRole('dialog').all()) {
    const box = await dialog.boundingBox();
    assert.ok(
      box && box.x >= -1 && box.x + box.width <= widths.viewport + 1,
      JSON.stringify(box),
    );
  }
}

try {
  await mkdir(output, { recursive: true });
  await page.goto(`${origin}/web/GEN/1`);
  await page.getByRole('button', { name: /, Chapter 1$/ }).waitFor();
  await waitReady('web');
  await page.setViewportSize({ width: 375, height: 850 });
  await openLocation();
  const bookGroup = page.getByRole('group', { name: 'Book', exact: true });
  const chapterGroup = page.getByRole('group', {
    name: 'Chapter',
    exact: true,
  });
  assert.equal(
    await chapterGroup
      .getByRole('button', { name: '1', exact: true })
      .getAttribute('aria-pressed'),
    'true',
  );
  const buttonRows = await Promise.all(
    [bookGroup, chapterGroup].map((group) =>
      group
        .locator('button')
        .evaluateAll(
          (buttons) =>
            new Set(
              buttons.map((button) =>
                Math.round(button.getBoundingClientRect().top),
              ),
            ).size,
        ),
    ),
  );
  assert.ok(
    buttonRows.every((rows) => rows > 1),
    JSON.stringify(buttonRows),
  );
  await page.screenshot({
    path: `${output}/location-mobile.png`,
    fullPage: true,
    animations: 'disabled',
  });
  await chapterGroup.getByRole('button', { name: '2', exact: true }).click();
  await page.waitForURL('**/web/GEN/2');
  await page.getByRole('heading', { name: 'Chapter 2', exact: true }).waitFor();
  await openLocation();
  await page
    .getByRole('group', { name: 'Chapter', exact: true })
    .getByRole('button', { name: '1', exact: true })
    .click();
  await page.waitForURL('**/web/GEN/1');
  await page.getByRole('heading', { name: 'Chapter 1', exact: true }).waitFor();
  await page.setViewportSize({ width: 1280, height: 900 });
  console.log(
    'Default WEB ready:',
    (await records()).map(({ id, sourceBytes, preparedBytes, downloaded }) => ({
      id,
      sourceBytes,
      preparedBytes,
      downloaded,
    })),
  );
  const initialRequests = bibleRequests.length;
  await selectTranslation(/New English Translation/);
  await page.waitForURL('**/net/GEN/1');
  assert.equal(
    (await records()).some((record) => record.id === 'net'),
    false,
  );
  assert.ok(
    bibleRequests
      .slice(initialRequests)
      .every(
        (path) =>
          path.endsWith('manifest.json') || path.endsWith('02-GENengnet.usfm'),
      ),
  );
  console.log(
    'Alternate selection did not install NET:',
    bibleRequests.slice(initialRequests),
  );
  await settings();
  const netRow = page.getByRole('listitem').filter({
    has: page.getByRole('heading', {
      name: 'New English Translation',
      exact: true,
    }),
  });
  await netRow.getByRole('button', { name: 'Download', exact: true }).click();
  await waitReady('net');
  console.log(
    'Installed storage:',
    (await records()).map(({ id, sourceBytes, preparedBytes }) => ({
      id,
      sourceBytes,
      preparedBytes,
    })),
  );
  const workerAsset = (await readdir('.output/public/assets')).find((name) =>
    /^translation\.worker-.*\.js$/.test(name),
  );
  assert.ok(workerAsset);
  const timings = await page.evaluate(async (asset) => {
    const worker = new Worker(`/assets/${asset}`, { type: 'module' });
    let requestId = 0;
    const search = (translationId, query) =>
      new Promise((resolve, reject) => {
        const started = performance.now();
        worker.onmessage = ({ data }) =>
          data.error
            ? reject(new Error(data.error))
            : resolve(performance.now() - started);
        worker.postMessage({
          action: 'search',
          requestId: ++requestId,
          translationId,
          query,
          page: 0,
        });
      });
    const results = [];
    try {
      for (const id of ['web', 'net']) {
        const cold = await search(id, 'light');
        const samples = [];
        for (let iteration = 0; iteration < 6; iteration++) {
          for (const query of [
            'God',
            '"in the beginning"',
            '"truly truly"',
            'Jerusalem light',
            'the',
          ])
            samples.push(await search(id, query));
        }
        samples.sort((left, right) => left - right);
        results.push({
          id,
          coldMs: Math.round(cold),
          warmP95Ms: Math.round(samples[Math.ceil(samples.length * 0.95) - 1]),
          samples: samples.length,
        });
      }
    } finally {
      worker.terminate();
    }
    return results;
  }, workerAsset);
  console.log(
    'Search timings (unthrottled Linux Chromium, includes worker RPC):',
    timings,
  );
  await page.keyboard.press('Escape');
  await selectTranslation(/World English Bible/);
  await page.waitForURL('**/web/GEN/1');
  await page.evaluate(() =>
    navigator.serviceWorker.ready.then(() => undefined),
  );
  await context.setOffline(true);
  const offlineStart = bibleRequests.length;
  await selectBook('Revelation');
  assert.equal(new URL(page.url()).pathname, '/web/GEN/1');
  const stagedBookChapter22 = page
    .getByRole('group', { name: 'Chapter', exact: true })
    .getByRole('button', { name: '22', exact: true });
  assert.equal(await stagedBookChapter22.getAttribute('aria-pressed'), 'false');
  assert.equal(await stagedBookChapter22.getAttribute('aria-current'), null);
  await stagedBookChapter22.scrollIntoViewIfNeeded();
  await stagedBookChapter22.click();
  await page.waitForURL('**/web/REV/22');
  await page
    .getByRole('heading', { name: 'Chapter 22', exact: true })
    .waitFor();
  await openLocation();
  await page
    .getByRole('group', { name: 'Chapter', exact: true })
    .getByRole('button', { name: '1', exact: true })
    .click();
  await page.waitForURL('**/web/REV/1');
  await page.getByRole('button', { name: 'Search Bible', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Words or quoted phrase' })
    .fill('"in the beginning"');
  await page
    .getByRole('status')
    .filter({ hasText: /\d+ matching verses/ })
    .waitFor();
  await page.getByRole('combobox', { name: 'Filter results by book' }).click();
  await page.getByRole('option', { name: 'Revelation', exact: true }).click();
  await page
    .getByRole('status')
    .filter({ hasText: 'No matching verses' })
    .waitFor();
  await page.getByRole('combobox', { name: 'Filter results by book' }).click();
  await page.getByRole('option', { name: 'Genesis', exact: true }).click();
  await page.getByRole('button', { name: /^Genesis 1:1/ }).waitFor();
  await noOverflow();
  await page.screenshot({
    path: `${output}/search-desktop.png`,
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: /^Genesis 1:1/ }).click();
  await page.waitForURL(
    (url) => url.pathname === '/web/GEN/1' && url.searchParams.has('verses'),
  );
  assert.equal(
    String(JSON.parse(new URL(page.url()).searchParams.get('verses'))),
    '1',
  );
  const selectedVerse = page.locator(
    '[data-verse-id="GEN/1:1"][data-selected]',
  );
  await selectedVerse.waitFor();
  const verseBounds = await selectedVerse.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { top: bounds.top, bottom: bounds.bottom, height: innerHeight };
  });
  assert.ok(
    verseBounds.top >= 0 && verseBounds.bottom <= verseBounds.height,
    JSON.stringify(verseBounds),
  );
  assert.equal(bibleRequests.length, offlineStart);
  console.log(
    'Offline book navigation, phrase search and result navigation passed',
  );
  await selectTranslation(/New English Translation/);
  await page.waitForURL((url) => url.pathname === '/net/GEN/1');
  assert.equal(bibleRequests.length, offlineStart);
  console.log('Explicit NET download and offline translation switching passed');
  await settings();
  await page.locator('input[type=file]').setInputFiles({
    name: 'partial.usfm',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      '\\id TST\n\\h Test Book\n\\c 1\n\\v 1 A bright morning.\n\\v 2 A quiet evening.',
    ),
  });
  await page
    .getByRole('textbox', { name: 'Translation name' })
    .fill('My offline edition');
  await page
    .getByRole('button', { name: 'Import translation', exact: true })
    .click();
  const importHeading = page.getByRole('heading', {
    name: 'My offline edition',
    exact: true,
  });
  await importHeading.waitFor();
  const imported = (await records()).find(
    (record) => record.origin === 'import',
  );
  assert.ok(imported);
  await waitReady(imported.id);
  await page.keyboard.press('Escape');
  await selectTranslation(/My offline edition/);
  await page.waitForURL(`**/${imported.id}/TST/1`);
  await page.getByRole('button', { name: 'Search Bible', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Words or quoted phrase' })
    .fill('bright');
  await page.getByRole('button', { name: /^Test Book 1:1/ }).waitFor();
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow();
    await page.screenshot({
      path: `${output}/search-${width}.png`,
      fullPage: true,
      animations: 'disabled',
    });
  }
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1280, height: 900 });
  await context.setOffline(false);
  await page.reload();
  await page.getByRole('button', { name: /, Chapter \d+$/ }).waitFor();
  assert.ok(page.url().includes(imported.id));
  assert.ok(!bibleRequests.some((path) => path.includes(imported.id)));
  console.log(
    'Offline partial import, search, responsive layouts and online local-route reload passed',
  );
  await settings();
  await page.screenshot({
    path: `${output}/settings-desktop.png`,
    fullPage: true,
    animations: 'disabled',
  });
  const webRow = page.getByRole('listitem').filter({
    has: page.getByRole('heading', {
      name: 'World English Bible (Catholic)',
      exact: true,
    }),
  });
  await webRow.getByRole('button', { name: 'Delete download' }).click();
  const confirmation = page.getByRole('dialog').filter({
    has: page.getByRole('heading', {
      name: 'Delete World English Bible (Catholic) from this device?',
    }),
  });
  await confirmation.getByRole('button', { name: 'Delete download' }).click();
  await confirmation.waitFor({ state: 'hidden' });
  await page.keyboard.press('Escape');
  await page.reload();
  await page.getByRole('button', { name: /, Chapter \d+$/ }).waitFor();
  assert.equal(
    (await records()).some((record) => record.id === 'web'),
    false,
  );
  assert.deepEqual(failures, []);
  console.log(
    'Default deletion stays suppressed across launch; no page errors',
  );
} finally {
  await browser.close();
}
