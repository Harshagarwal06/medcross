#!/usr/bin/env node
/**
 * Optional browser smoke helper.
 *
 * Usage:
 *   python3 -m http.server 8787
 *   MEDCROSS_BASE_URL=http://127.0.0.1:8787 node tests/browser-smoke.js
 *
 * Requires Playwright to be installed in the local environment.
 */
const assert = require('assert');

async function main() {
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch {
    console.log('Playwright is not installed. Install it locally to run browser smoke tests.');
    return;
  }

  const baseUrl = process.env.MEDCROSS_BASE_URL || 'http://127.0.0.1:8787';
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('#puzzles-grid .puzzle-card');
  const cardCount = await page.locator('#puzzles-grid .puzzle-card').count();
  assert(cardCount > 0, 'homepage should render puzzle cards');

  await page.goto(`${baseUrl}/stats.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#stats-overview .ov-card');
  await page.waitForSelector('#export-data');

  await page.goto(`${baseUrl}/study.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#study-due');
  await page.waitForSelector('#grade-good');

  await browser.close();
  console.log(`Browser smoke passed against ${baseUrl}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
