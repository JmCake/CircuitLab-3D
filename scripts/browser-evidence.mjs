/** Let transient notifications expire normally; clicking one races its removal on slow renderers. */
export async function settleNotifications(page) {
  await page.waitForFunction(() => document.querySelectorAll('.toast-card').length === 0, null, { timeout: 10000 });
}
