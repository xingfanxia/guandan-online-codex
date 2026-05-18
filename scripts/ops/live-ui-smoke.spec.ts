import { expect, test } from '@playwright/test';

const BASE_URL = process.env.GDO_BASE_URL ?? 'https://guandan-online-codex.vercel.app';
const SMOKE_USER_AGENT = 'vercel-cron/1.0 gdo-live-ui-smoke';

test('two browser contexts can join, start, and sync a live room', async ({ browser }) => {
  const suffix = Date.now().toString(36).slice(-6);
  const hostHandle = `host${suffix}`;
  const guestHandle = `guest${suffix}`;
  const hostContext = await browser.newContext({ userAgent: SMOKE_USER_AGENT });
  const guestContext = await browser.newContext({ userAgent: SMOKE_USER_AGENT });
  await seedProfile(hostContext, hostHandle);
  await seedProfile(guestContext, guestHandle);
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  try {
    await host.goto(BASE_URL);
    await host.getByRole('button', { name: '开房' }).click();
    await host.getByRole('button', { name: '创建房间' }).click();
    await expect(host.getByLabel('Waiting room')).toBeVisible();

    const roomCode = (await host.locator('.gdo-room-panel__header strong').textContent())?.trim();
    expect(roomCode).toMatch(/^[A-Z0-9]{6}$/);

    await guest.goto(BASE_URL);
    await guest.getByRole('button', { name: '大厅' }).click();
    await guest.getByLabel(`加入 ${roomCode}`).click();
    await expect(guest.getByLabel('Waiting room')).toBeVisible();
    await expect(guest.getByText(`@${guestHandle}`)).toBeVisible();

    await expect(host.getByText(`@${guestHandle}`)).toBeVisible({ timeout: 5_000 });
    await host.getByRole('button', { name: '开始' }).click();

    await expect(host.getByLabel('Guandan table')).toBeVisible({ timeout: 10_000 });
    await expect(guest.getByLabel('Guandan table')).toBeVisible({ timeout: 10_000 });
    await expect(host.getByLabel('Your hand').getByRole('button')).toHaveCount(27);
    await expect(guest.getByLabel('Your hand').getByRole('button')).toHaveCount(27);

    const hostVersionBefore = await tableVersion(host);
    const guestVersionBefore = await tableVersion(guest);
    const { actor, observer } = await playFromFirstEnabled([
      { actor: host, observer: guest },
      { actor: guest, observer: host },
    ]);
    const observerVersionBefore = observer === host ? hostVersionBefore : guestVersionBefore;

    await expect.poll(() => tableVersion(observer), { timeout: 10_000 }).toBeGreaterThan(observerVersionBefore);
    await expect(actor.getByLabel('Current trick')).toBeVisible();
    await expect(observer.getByLabel('Current trick')).toBeVisible();
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});

async function seedProfile(context: import('@playwright/test').BrowserContext, handle: string): Promise<void> {
  await context.addInitScript((storedHandle) => {
    window.localStorage.setItem('gdo:player-profile:v1', JSON.stringify({ handle: storedHandle }));
  }, handle);
}

async function playFromFirstEnabled(
  candidates: Array<{ actor: import('@playwright/test').Page; observer: import('@playwright/test').Page }>,
): Promise<{ actor: import('@playwright/test').Page; observer: import('@playwright/test').Page }> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    for (const candidate of candidates) {
      const suggest = candidate.actor.getByRole('button', { name: '提示' });
      if (!(await suggest.isEnabled())) continue;

      await suggest.click();
      const play = candidate.actor.getByRole('button', { name: /出牌 · [1-9]\d* 张/ });
      const pass = candidate.actor.getByRole('button', { name: '不要' });
      await waitForCommand(candidate.actor, play, pass);
      if (await play.isEnabled()) {
        await play.click();
        return candidate;
      }
      if (await pass.isEnabled()) {
        await pass.click();
        return candidate;
      }
    }
    await candidates[0]!.actor.waitForTimeout(250);
  }
  throw new Error('No human player received the current turn within 10s');
}

async function waitForCommand(
  page: import('@playwright/test').Page,
  play: import('@playwright/test').Locator,
  pass: import('@playwright/test').Locator,
): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if ((await play.isEnabled()) || (await pass.isEnabled())) return;
    await page.waitForTimeout(100);
  }
}

async function tableVersion(page: import('@playwright/test').Page): Promise<number> {
  const text = await page.locator('.gdo-round').textContent();
  const version = Number(text?.replace(/^v/, ''));
  return Number.isFinite(version) ? version : 0;
}
