import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { settleNotifications } from './browser-evidence.mjs';
const port = await new Promise(resolve => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
const url = `http://127.0.0.1:${port}/`, out = path.resolve('screenshots/bench-v0.4'); await fs.mkdir(out, { recursive: true });
for (let i = 0; i < 60; i++) { try { if ((await fetch(url)).ok) break; } catch {} await new Promise(r => setTimeout(r, 250)); }
let executablePath; for (const p of [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)) { try { await fs.access(p); executablePath = p; break; } catch {} }
assert(executablePath); const browser = await chromium.launch({ executablePath, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const evidence = { interactions: [], meshes: [], errors: [] };
let page;
try {
  page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
  page.on('pageerror', e => evidence.errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') evidence.errors.push(m.text()); });
  await page.goto(url); await page.waitForFunction(() => window.__circuitlab?.renderStats()?.frame > 10);
  const shot = async name => { await settleNotifications(page); await page.screenshot({ path: path.join(out, name + '.png'), animations: 'disabled' }); };
  async function fixture(kind) {
    await page.evaluate(async kind => {
      const { createDefaultParams } = await import('/src/circuit/catalog.ts'); const s = window.__circuitlab.store;
      const part = (id, type, position, params = {}) => ({ id, type, name: ({ psu: '双路电源', dmm: '台式万用表', scope: '数字示波器', ac: '三相电源', r: '电阻 R1' })[id], position, rotationY: 0, params: { ...createDefaultParams(type), ...params } });
      const components = kind === 'dc' ? [part('psu', 'programmable-supply', [-0.86, -0.25]), part('r', 'resistor', [-0.08, 0.1], { resistance: 10 }), part('dmm', 'multimeter', [0.68, 0.28]), part('scope', 'oscilloscope', [0.75, -0.27])] : [part('ac', 'three-phase-source', [-0.8, -0.2]), part('scope', 'oscilloscope', [0.65, -0.2]), part('dmm', 'multimeter', [0.55, 0.3], { mode: 'acv' })];
      const edges = kind === 'dc' ? [['psu:positive', 'r:a'], ['psu:negative', 'r:b'], ['dmm:positive', 'r:a'], ['dmm:negative', 'r:b'], ['scope:ch1', 'psu:positive'], ['scope:negative', 'psu:negative']] : [['ac:a', 'scope:ch1'], ['ac:b', 'scope:ch2'], ['ac:n', 'scope:negative'], ['ac:c', 'dmm:positive'], ['ac:n', 'dmm:negative']];
      s.getState().importWorkspace({ ...s.getState().getWorkspace(), activeLabId: 'iv-characteristics', mode: 'free', components, wires: edges.map(([fromPortId, toPortId], i) => ({ id: `${kind}-${i}`, fromPortId, toPortId, color: ['#ab5145', '#323b38', '#c2974b', '#657f87'][i % 4] })), measurements: [] });
    }, kind);
    await page.waitForFunction(() => window.__circuitlab.store.getState().result.solved);
    if (page.viewportSize().width <= 760 && await page.getByRole('button', { name: '侧边收起器材库', exact: true }).isVisible()) await page.getByRole('button', { name: '侧边收起器材库', exact: true }).click();
    await page.getByRole('button', { name: '透视', exact: true }).click(); await page.waitForTimeout(800);
  }
  async function consoleFor(id) { await page.getByLabel('选择台上器材').selectOption(id); await page.getByRole('button', { name: '打开器材控制台', exact: true }).click(); return page.getByRole('dialog'); }
  async function mesh(label) { await page.waitForFunction(() => { const a = window.__circuitlab; return a.wireClearance()?.wires.length === a.store.getState().wires.length; }); const r = await page.evaluate(() => window.__circuitlab.wireClearance()); assert.deepEqual(r.collisions, []); evidence.meshes.push({ label, wires: r.wires.length, collisions: r.collisions }); }
  await fixture('dc'); await mesh('programmable supply, DMM and scope'); await shot('01-workspace');
  const knob = await page.evaluate(() => ({ point: window.__circuitlab.localScreen('psu', [-0.18, 0.043, 0.211]), voltage: window.__circuitlab.store.getState().components.find(c => c.id === 'psu').params.voltage }));
  await page.mouse.move(...knob.point); await page.mouse.down(); await page.mouse.move(knob.point[0] + 26, knob.point[1], { steps: 10 }); await page.mouse.up();
  const changed = await page.evaluate(() => window.__circuitlab.store.getState().components.find(c => c.id === 'psu').params.voltage); assert.notEqual(changed, knob.voltage); evidence.interactions.push({ action: 'actual-programmable-voltage-knob', before: knob.voltage, after: changed }); await page.evaluate(() => window.__circuitlab.store.getState().setParam('psu', 'voltage', 5));
  const sceneWidth = await page.locator('.scene-column').evaluate(e => e.getBoundingClientRect().width); assert.equal(sceneWidth, 1600);
  await page.getByRole('button', { name: '向上折叠器材库', exact: true }).click(); assert(await page.locator('.library-panel').evaluate(e => e.getBoundingClientRect().height < 65));
  await page.getByRole('button', { name: '侧边收起器材库', exact: true }).click(); assert.equal(await page.locator('.library-panel').count(), 0);
  await page.getByRole('button', { name: '收起实验面板', exact: true }).click(); assert(await page.locator('.side-panel').isHidden());
  const beforePan = await page.evaluate(() => ({ pose: window.__circuitlab.camera.getPose(), components: window.__circuitlab.store.getState().components.map(c => c.position) }));
  await page.getByRole('button', { name: '向右平移视野', exact: true }).click();
  await page.waitForFunction(before => { const next = window.__circuitlab.camera.getPose(); return next && Math.hypot(...next.target.map((v, i) => v - before[i])) > 0.1599; }, beforePan.pose.target);
  const afterPan = await page.evaluate(() => ({ pose: window.__circuitlab.camera.getPose(), components: window.__circuitlab.store.getState().components.map(c => c.position) }));
  assert.deepEqual(beforePan.components, afterPan.components); assert.notDeepEqual(beforePan.pose.position, afterPan.pose.position);
  for (let i = 0; i < 3; i++) assert(Math.abs((beforePan.pose.position[i] - beforePan.pose.target[i]) - (afterPan.pose.position[i] - afterPan.pose.target[i])) < 1e-6);
  evidence.interactions.push({ action: 'fold-pan-without-orbit-or-moving-parts', before: beforePan.pose, after: afterPan.pose, sceneWidth }); await shot('02-wide-view');
  await page.getByRole('button', { name: '展开左侧器材库', exact: true }).click(); await page.getByRole('button', { name: '向下展开器材库', exact: true }).click(); await page.getByRole('button', { name: '展开实验面板', exact: true }).click();
  let dialog = await consoleFor('psu'); assert((await dialog.innerText()).includes('CC'));
  await dialog.getByLabel('CH1 电流限制', { exact: true }).fill('0.02'); await dialog.getByLabel('CH1 电流限制', { exact: true }).press('Tab');
  const limited = await page.evaluate(() => window.__circuitlab.store.getState().result.elements.psu); assert(Math.abs(limited.current - 0.02) < 1e-8); evidence.interactions.push({ action: 'CC-control', current: limited.current, voltage: limited.voltage }); await shot('03-power-console');
  const header = await dialog.locator('.console-heading').boundingBox(); await page.mouse.move(header.x + 160, header.y + 28); await page.mouse.down(); await page.mouse.move(header.x + 80, header.y - 42, { steps: 8 }); await page.mouse.up();
  assert((await dialog.boundingBox()).y < header.y - 40); await page.getByRole('button', { name: '关闭器材控制台', exact: true }).click();
  await page.getByRole('button', { name: '撤销', exact: true }).click(); assert.equal(await page.evaluate(() => window.__circuitlab.store.getState().components.find(c => c.id === 'psu').params.currentLimit), 0.05);
  await page.getByRole('button', { name: '重做', exact: true }).click(); assert.equal(await page.evaluate(() => window.__circuitlab.store.getState().components.find(c => c.id === 'psu').params.currentLimit), 0.02);
  dialog = await consoleFor('dmm'); assert((await dialog.locator('.console-digital').innerText()).includes('0.20 V')); await dialog.getByRole('button', { name: '记录当前读数', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__circuitlab.store.getState().measurements.length), 1); await shot('04-dmm-console'); await page.getByRole('button', { name: '关闭器材控制台', exact: true }).click();
  await fixture('ac'); await mesh('shared-COM AC instrument inputs'); dialog = await consoleFor('scope');
  assert((await dialog.innerText()).includes('-120.00°')); assert((await dialog.innerText()).includes('24.000 V')); await shot('05-scope-console');
  const original = await dialog.getByRole('img', { name: '实际双通道电压波形' }).locator('polyline').first().getAttribute('points');
  await dialog.getByRole('button', { name: '切换采集', exact: true }).click();
  await page.evaluate(() => window.__circuitlab.store.getState().setParam('ac', 'phaseVoltage', 48));
  assert.equal(await dialog.getByRole('img', { name: '实际双通道电压波形' }).locator('polyline').first().getAttribute('points'), original);
  await page.getByRole('button', { name: '关闭器材控制台', exact: true }).click(); dialog = await consoleFor('scope');
  assert.equal(await dialog.getByRole('img', { name: '实际双通道电压波形' }).locator('polyline').first().getAttribute('points'), original);
  await dialog.getByRole('button', { name: '切换采集', exact: true }).click(); assert.notEqual(await dialog.getByRole('img', { name: '实际双通道电压波形' }).locator('polyline').first().getAttribute('points'), original);
  evidence.interactions.push({ action: 'two-channel-phase-and-hold-across-console-reopen', phase: -120 }); await page.getByRole('button', { name: '关闭器材控制台', exact: true }).click();
  await page.evaluate(() => window.__circuitlab.store.getState().loadLab('iv-characteristics', true)); await page.getByRole('tab', { name: '数据', exact: true }).click();
  for (const name of ['电阻', '小灯泡']) { await page.getByRole('button', { name, exact: true }).click(); const slider = page.getByLabel('伏安测量电源电压'); await slider.press('Home'); for (let i = 0; i < 5; i++) { await slider.press('PageUp'); await slider.press('PageUp'); await page.getByRole('button', { name: '记录当前读数', exact: true }).click(); } }
  const count = await page.evaluate(() => window.__circuitlab.store.getState().measurements.length); await page.getByRole('button', { name: '数据大屏', exact: true }).click(); dialog = page.getByRole('dialog');
  assert(await dialog.getByRole('img', { name: '电阻与小灯泡伏安特性测量曲线' }).isVisible());
  const download = page.waitForEvent('download'); await dialog.getByRole('button', { name: '导出 CSV', exact: true }).click(); assert((await fs.readFile(await (await download).path(), 'utf8')).includes('小灯泡'));
  await dialog.getByRole('button', { name: '进入全屏', exact: true }).click(); await page.waitForFunction(() => Boolean(document.fullscreenElement)); await shot('06-data-presentation');
  await dialog.getByRole('button', { name: '退出全屏', exact: true }).click(); await page.getByRole('button', { name: '关闭数据大屏', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__circuitlab.store.getState().measurements.length), count); evidence.interactions.push({ action: 'full-screen-data-and-CSV-preserve-records', count });
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(600); await page.getByRole('button', { name: '数据大屏', exact: true }).click(); await shot('07-mobile-data');
  evidence.mobile = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth })); assert.equal(evidence.mobile.scrollWidth, 390); await page.getByRole('button', { name: '关闭数据大屏', exact: true }).click();
  await fixture('ac'); dialog = await consoleFor('scope'); await dialog.getByLabel('水平时基', { exact: true }).selectOption('0.005');
  assert(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)); await dialog.locator('.console-content').evaluate(el => { el.scrollTop = 0; }); await shot('08-mobile-console');
  await dialog.getByRole('button', { name: '关闭器材控制台', exact: true }).focus();
  await page.keyboard.press('Delete'); await page.getByRole('dialog').waitFor({ state: 'detached' }); assert(await page.getByRole('tab', { name: '实验', exact: true }).isVisible());
  evidence.interactions.push({ action: 'mobile-scope-controls-and-deleted-console-recovery' });
  assert.deepEqual(evidence.errors, []); await fs.writeFile(path.join(out, 'evidence.json'), JSON.stringify(evidence, null, 2)); console.log('[bench] PASS', JSON.stringify(evidence, null, 2));
} catch (error) {
  if (page && !page.isClosed()) { await page.screenshot({ path: path.join(out, 'failure.png'), animations: 'disabled' }); await fs.writeFile(path.join(out, 'failure-state.txt'), await page.locator('body').innerText()); }
  throw error;
} finally { await browser.close(); server.kill(); }
