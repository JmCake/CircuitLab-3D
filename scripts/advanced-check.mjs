import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';

let server;
const port = process.env.CIRCUITLAB_URL ? null : await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.on('error', reject);
  probe.listen(0, '127.0.0.1', () => { const address = probe.address(); probe.close(() => resolve(address.port)); });
});
const url = process.env.CIRCUITLAB_URL ?? `http://127.0.0.1:${port}/`;
if (!process.env.CIRCUITLAB_URL) {
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { ready = (await fetch(url)).ok; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!ready) { server.kill(); throw new Error('无法启动本次检出的 Vite 服务'); }
}
const out = path.resolve('screenshots/v0.2');
await fs.mkdir(out, { recursive: true });
const candidates = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);
let executablePath;
for (const p of candidates) { try { await fs.access(p); executablePath = p; break; } catch {} }
assert(executablePath, '需要系统 Chrome / Chromium');
const browser = await chromium.launch({ executablePath, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const evidence = { url, labs: [], errors: [] };
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  page.on('pageerror', e => evidence.errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') evidence.errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.__circuitlab?.renderStats()?.frame > 10);
  await page.waitForTimeout(2500);
  const stats = () => page.evaluate(() => window.__circuitlab.renderStats());
  const closeToasts = async () => {
    while (await page.getByRole('button', { name: '关闭提示', exact: true }).count()) await page.getByRole('button', { name: '关闭提示', exact: true }).first().click();
  };
  evidence.fine = await stats();
  await page.waitForTimeout(500);
  evidence.idle = { before: evidence.fine.frame, after: (await stats()).frame };
  assert.equal(evidence.idle.before, evidence.idle.after, '静止实验台不应持续绘制');
  evidence.gpu = await page.evaluate(() => {
    const gl = document.querySelector('canvas').getContext('webgl2');
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return { renderer: debug && gl.getParameter(debug.UNMASKED_RENDERER_WEBGL), contextLost: gl.isContextLost() };
  });
  console.log('[advanced] idle rendering', evidence.idle, evidence.fine);

  const labIds = ['ohms-law', 'series', 'parallel', 'kirchhoff', 'led', 'rc', 'thevenin', 'superposition', 'max-power'];
  for (const id of labIds) {
    await page.getByRole('tab', { name: '实验', exact: true }).click();
    await page.getByLabel('选择教学实验').selectOption(id);
    await page.getByRole('button', { name: '载入示范接线', exact: true }).click();
    await page.waitForFunction(labId => window.__circuitlab.store.getState().components.every(c => c.id.startsWith(labId + '-')), id);
    const state = await page.evaluate(() => window.__circuitlab.snapshot());
    assert(state.solved && state.wires > 0, id + ' 应有实际可解接线');
    evidence.labs.push({ id, ...state });
    if (id === 'ohms-law') {
      await page.getByRole('tab', { name: '数据', exact: true }).click();
      await page.getByRole('button', { name: '记录当前读数', exact: true }).click();
      await closeToasts();
      await page.getByRole('tab', { name: '实验', exact: true }).click();
      await page.locator('.side-panel-content').evaluate(el => { el.scrollTop = 0; });
      await page.screenshot({ path: path.join(out, '01-wired.png') });
    }
    if (id === 'thevenin' || id === 'max-power' || id === 'superposition') {
      await page.getByRole('tab', { name: '数据', exact: true }).click();
      const panel = page.getByRole('region', { name: '电路数值分析' });
      await panel.scrollIntoViewIfNeeded();
      await closeToasts();
      assert((await panel.innerText()).includes('节点电流与功率平衡通过'));
      assert.equal(await panel.locator('.equivalent-metrics strong').count(), 4);
      if (id === 'superposition') assert.equal(await panel.locator('.superposition-results > div').count(), 3);
      await page.screenshot({ path: path.join(out, id + '.png') });
      if (id === 'max-power') {
        await page.getByLabel('选择台上器材').selectOption('max-power-load');
        const resistance = page.getByLabel('总阻值', { exact: true });
        for (const value of ['100', '500', '2000']) {
          await resistance.fill(value);
          await resistance.press('Tab');
          await page.getByRole('tab', { name: '数据', exact: true }).click();
          await page.getByRole('button', { name: '记录当前读数', exact: true }).click();
          await page.getByRole('tab', { name: '属性', exact: true }).click();
        }
        await resistance.fill('500');
        await resistance.press('Tab');
        await page.getByRole('tab', { name: '实验', exact: true }).click();
        const progress = await page.locator('.lab-progress-row strong').innerText();
        assert.equal(progress.replace(/\s/g, ''), '3/3');
        evidence.maxPowerProgress = progress;
      }
    }
  }

  await page.getByRole('button', { name: '顶视', exact: true }).click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(out, 'top-view.png') });
  await page.getByRole('button', { name: '前视', exact: true }).click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(out, 'front-view.png') });
  await page.getByLabel('渲染画质').selectOption('smooth');
  await page.waitForTimeout(1600);
  evidence.smooth = await stats();
  await page.getByRole('button', { name: '透视', exact: true }).click();
  await page.waitForTimeout(900);

  // UI-driven RC charging, pausing and physical discharge (E=0 retains source resistance).
  await page.getByLabel('选择教学实验').selectOption('rc');
  await page.getByRole('button', { name: '载入示范接线', exact: true }).click();
  await page.getByRole('tab', { name: '数据', exact: true }).click();
  await page.getByRole('button', { name: '启动暂态', exact: true }).click();
  const start = performance.now();
  await page.waitForTimeout(1250);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  evidence.rc = await page.evaluate(() => {
    const t = window.__circuitlab.store.getState().transient;
    return { time: t.time, voltages: t.capacitorVoltages, samples: t.samples.length };
  });
  evidence.rc.wallSeconds = (performance.now() - start) / 1000;
  assert(Math.abs(evidence.rc.time - evidence.rc.wallSeconds) < 0.45, '墙钟时间与仿真时间应接近');
  await page.waitForTimeout(300);
  assert.equal((await page.evaluate(() => window.__circuitlab.snapshot())).transientTime, evidence.rc.time, '暂停时仿真时钟冻结');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出曲线 CSV', exact: true }).click();
  const download = await downloadPromise;
  const csvPath = path.join(out, 'transient.csv');
  await download.saveAs(csvPath);
  const csv = await fs.readFile(csvPath, 'utf8');
  assert(csv.includes('仿真时间(s)') && csv.split('\n').length > 10);
  evidence.rc.csvRows = csv.split('\n').length - 1;
  await page.getByRole('button', { name: '电源置 0 V 放电', exact: true }).click();
  await page.getByRole('button', { name: '继续运行', exact: true }).click();
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  evidence.discharge = await page.evaluate(() => {
    const s = window.__circuitlab.store.getState();
    const cap = s.components.find(c => c.type === 'capacitor');
    return { voltage: s.transient.capacitorVoltages[cap.id], power: s.result.elements[cap.id].power };
  });
  assert(evidence.discharge.voltage < 1 && evidence.discharge.power < 0);
  await page.screenshot({ path: path.join(out, 'rc-discharge.png') });

  // Focus containment and restoration, keyboard-accessible equipment selection.
  const help = page.getByRole('button', { name: '打开操作说明' });
  await help.click();
  await page.keyboard.press('Tab');
  assert(await page.getByRole('dialog').evaluate(el => el.contains(document.activeElement)));
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert(await help.evaluate(el => el === document.activeElement));

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const phone = await mobile.newPage();
  phone.on('pageerror', e => evidence.errors.push('mobile: ' + String(e)));
  await phone.goto(url);
  await phone.waitForFunction(() => window.__circuitlab?.renderStats()?.frame > 10);
  evidence.mobile = await phone.evaluate(() => {
    const bounds = selector => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    return { viewport: window.innerWidth, scrollWidth: document.documentElement.scrollWidth,
      scene: bounds('.scene-column'), panel: bounds('.side-panel'), libraryOpen: window.__circuitlab.store.getState().libraryOpen };
  });
  assert(evidence.mobile.scrollWidth <= 390, '窄屏不应产生水平溢出');
  assert(evidence.mobile.scene.width > 380 && evidence.mobile.scene.height >= 260);
  assert(evidence.mobile.panel.y > evidence.mobile.scene.y && !evidence.mobile.libraryOpen);
  await phone.screenshot({ path: path.join(out, 'mobile.png') });
  await mobile.close();
  assert.equal(evidence.errors.length, 0, '浏览器不能有运行错误');
  console.log('[advanced] PASS', JSON.stringify(evidence, null, 2));
  await fs.writeFile(path.join(out, 'evidence.json'), JSON.stringify(evidence, null, 2));
} finally { await browser.close(); server?.kill(); }
