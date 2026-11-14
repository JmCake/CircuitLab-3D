import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { settleNotifications } from './browser-evidence.mjs';

const port = process.env.CIRCUITLAB_URL ? null : await new Promise((resolve, reject) => {
  const probe = createServer(); probe.on('error', reject); probe.listen(0, '127.0.0.1', () => { const p = probe.address().port; probe.close(() => resolve(p)); });
});
const url = process.env.CIRCUITLAB_URL ?? `http://127.0.0.1:${port}/`;
let server;
if (!process.env.CIRCUITLAB_URL) {
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
  let ready = false;
  for (let i = 0; i < 60; i++) { try { ready = (await fetch(url)).ok; } catch {} if (ready) break; await new Promise(r => setTimeout(r, 250)); }
  if (!ready) { server.kill(); throw new Error('Vite failed to start'); }
}
const out = path.resolve('screenshots/course-v0.3'); await fs.mkdir(out, { recursive: true });
let executablePath;
for (const p of [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)) { try { await fs.access(p); executablePath = p; break; } catch {} }
assert(executablePath, 'System Chrome required');
const browser = await chromium.launch({ executablePath, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const evidence = { labs: [], interactions: [], errors: [] };
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
  page.on('pageerror', e => evidence.errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') evidence.errors.push(m.text()); });
  await page.goto(url); await page.waitForFunction(() => window.__circuitlab?.renderStats()?.frame > 10);
  const record = () => page.getByRole('button', { name: '记录当前读数', exact: true }).click();
  const data = () => page.getByRole('tab', { name: '数据', exact: true }).click();
  const snapshot = () => page.evaluate(() => window.__circuitlab.snapshot());
  const shot = async name => {
    await settleNotifications(page);
    await page.screenshot({ path: path.join(out, name + '.png'), animations: 'disabled' });
  };
  async function load(id) {
    await page.getByRole('tab', { name: '实验', exact: true }).click(); await page.getByLabel('选择教学实验').selectOption(id);
    await page.getByRole('button', { name: '载入示范接线', exact: true }).click();
    await page.waitForFunction(id => window.__circuitlab.store.getState().activeLabId === id && window.__circuitlab.store.getState().result.status === 'ok', id);
    evidence.labs.push({ id, ...await snapshot() }); console.log('[course]', id, 'wired and solved'); await data();
  }
  async function progress(expected) {
    await page.getByRole('tab', { name: '实验', exact: true }).click(); assert.equal((await page.locator('.lab-progress-row strong').innerText()).replaceAll(/\s/g, ''), expected); await data();
  }
  async function resistance(id, r) {
    await page.getByLabel('选择台上器材').selectOption(id); await page.getByRole('tab', { name: '属性', exact: true }).click();
    await page.getByLabel('总阻值', { exact: true }).fill(String(r)); await page.getByLabel('总阻值', { exact: true }).press('Tab'); await data();
  }
  const rows = id => page.evaluate(id => window.__circuitlab.store.getState().measurements.filter(r => r.labId === id), id);
  assert.equal(await page.getByLabel('选择教学实验').locator('option').count(), 8);
  assert.equal(await page.getByRole('button', { name: /^教学面包板/ }).count(), 0);
  await load('iv-characteristics');
  const voltage = page.getByLabel('伏安测量电源电压');
  for (const name of ['电阻', '小灯泡']) {
    await page.getByRole('button', { name, exact: true }).click(); await voltage.press('Home');
    for (let i = 0; i < 10; i++) { await voltage.press('PageUp'); await record(); }
  }
  await progress('5/5'); const iv = await rows('iv-characteristics');
  assert(iv.filter(r => r.observation.settings['iv-characteristics-r1.type'] === 'bulb').at(-1).current > iv.filter(r => r.observation.settings['iv-characteristics-r1.type'] === 'resistor').at(-1).current * 4);
  evidence.interactions.push({ action: 'keyboard-voltage-and-physical-specimen', points: iv.length }); await shot('01-iv');
  const downloadWait = page.waitForEvent('download'); await page.getByRole('button', { name: '导出 CSV', exact: true }).click();
  assert((await fs.readFile(await (await downloadWait).path(), 'utf8')).includes('小灯泡'));
  await load('potentials'); await page.getByLabel('电位参考点').selectOption('potentials-ps:negative'); await record();
  const before = await page.getByRole('img', { name: '电路电位图', exact: true }).locator('polyline').getAttribute('points');
  await page.getByLabel('电位参考点').selectOption('potentials-r2:a'); await record();
  const after = await page.getByRole('img', { name: '电路电位图', exact: true }).locator('polyline').getAttribute('points');
  assert.notEqual(before, after); await progress('4/4'); evidence.interactions.push({ action: 'reference-change', before, after }); await shot('02-potentials');
  await load('kirchhoff');
  for (const u of [6, 9, 12]) { await page.evaluate(u => window.__circuitlab.store.getState().setParam('kirchhoff-ps', 'voltage', u), u); await record(); }
  await progress('4/4');
  await page.getByLabel('选择台上器材').selectOption('kirchhoff-am'); await page.getByRole('button', { name: '交流 AC · 有效值', exact: true }).click(); await data();
  assert(await page.getByRole('button', { name: '记录当前读数', exact: true }).isDisabled());
  await page.getByLabel('选择台上器材').selectOption('kirchhoff-am'); await page.getByRole('tab', { name: '属性', exact: true }).click();
  await page.getByRole('button', { name: '直流 DC', exact: true }).click(); await data(); await shot('03-kirchhoff');
  await load('superposition');
  for (const name of ['共同作用', '仅 U₁', '仅 U₂']) { await page.getByRole('button', { name, exact: true }).click(); await record(); }
  await page.getByLabel('齐次性倍率').selectOption('2'); await page.getByRole('button', { name: '两路同比变化', exact: true }).click(); await record();
  await progress('4/4'); evidence.interactions.push({ action: 'superposition-and-homogeneity', cases: 4 }); await shot('04-superposition');
  for (const id of ['thevenin', 'max-power']) {
    await load(id); for (const r of [100, 500, 2000]) { await resistance(id + '-load', r); await record(); } await progress('4/4');
    if (id === 'max-power') { const p = (await rows(id)).map(r => r.observation.values['p:max-power-load']); assert(p[1] > p[0] && p[1] > p[2]); evidence.interactions.push({ action: 'power-matching', powers: p }); }
    await shot(id === 'thevenin' ? '05-thevenin' : '06-max-power');
  }
  await load('three-phase-star');
  await page.getByRole('button', { name: '对称负载', exact: true }).click(); await record();
  await page.getByRole('button', { name: '不对称负载', exact: true }).click(); await record();
  await page.getByRole('button', { name: '中性线接通', exact: true }).click(); await record(); await progress('4/4');
  const star = (await rows('three-phase-star')).map(r => r.observation.values);
  assert(star[1].neutralI > 0.01 && star[2].neutralI < 1e-8 && star[2].neutralShift > 1);
  const knob = await page.evaluate(() => ({ point: window.__circuitlab.localScreen('three-phase-star-ps', [-0.166, 0.114, 0.18]), value: window.__circuitlab.store.getState().components.find(c => c.id === 'three-phase-star-ps').params.phaseVoltage }));
  assert(knob.point); await page.mouse.move(...knob.point); await page.mouse.down(); await page.mouse.move(knob.point[0] + 24, knob.point[1], { steps: 10 }); await page.mouse.up();
  const changed = await page.evaluate(() => window.__circuitlab.store.getState().components.find(c => c.id === 'three-phase-star-ps').params.phaseVoltage);
  assert.notEqual(changed, knob.value, 'actual AC knob must change voltage');
  await page.evaluate(() => window.__circuitlab.store.getState().setParam('three-phase-star-ps', 'phaseVoltage', 24));
  await data();
  evidence.interactions.push({ action: 'neutral-open-and-AC-knob', readings: star, voltageBefore: knob.value, voltageAfter: changed }); await shot('07-star-neutral-open');
  await load('three-phase-delta');
  await page.getByRole('button', { name: '对称负载', exact: true }).click(); await record();
  await page.getByRole('button', { name: '不对称负载', exact: true }).click(); await record(); await progress('4/4');
  const delta = (await rows('three-phase-delta')).map(r => r.observation.values);
  assert(Math.abs(delta[0].lineIA / delta[0].phaseIA - Math.sqrt(3)) < 0.01); assert(Math.abs(delta[1].lineIA / delta[1].phaseIA - Math.sqrt(3)) > 0.1);
  assert.equal(await page.getByRole('button', { name: /^中性线/ }).count(), 0); evidence.interactions.push({ action: 'delta-balanced-and-unbalanced', readings: delta }); await shot('08-delta');
  await page.getByRole('button', { name: '顶视', exact: true }).click(); await page.waitForTimeout(700); await shot('09-top');
  await page.getByRole('button', { name: '透视', exact: true }).click(); await page.waitForTimeout(900);
  const a = await page.evaluate(() => window.__circuitlab.renderStats().frame); await page.waitForTimeout(700);
  const b = await page.evaluate(() => window.__circuitlab.renderStats().frame); assert.equal(a, b); evidence.idle = { before: a, after: b };
  await page.getByRole('button', { name: '保存', exact: true }).click(); const saved = await snapshot();
  await page.reload(); await page.waitForFunction(() => window.__circuitlab?.renderStats()?.frame > 10); const restored = await snapshot();
  assert.equal(saved.measurements, restored.measurements); assert.equal(saved.components, restored.components); assert.equal(await page.getByLabel('选择教学实验').inputValue(), 'three-phase-delta');
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } }); mobile.on('pageerror', e => evidence.errors.push('mobile: ' + String(e)));
  await mobile.goto(url); await mobile.waitForFunction(() => window.__circuitlab?.renderStats()?.frame > 10);
  await mobile.getByLabel('选择教学实验').selectOption('three-phase-star'); await mobile.getByRole('button', { name: '载入示范接线', exact: true }).click(); await mobile.getByRole('tab', { name: '数据', exact: true }).click();
  evidence.mobile = await mobile.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, libraryOpen: window.__circuitlab.store.getState().libraryOpen }));
  assert.equal(evidence.mobile.width, 390); assert(evidence.mobile.scrollWidth <= 390); assert.equal(evidence.mobile.libraryOpen, false);
  await settleNotifications(mobile);
  await mobile.screenshot({ path: path.join(out, '10-mobile.png'), animations: 'disabled' }); await mobile.close(); assert.deepEqual(evidence.errors, []);
  await fs.writeFile(path.join(out, 'evidence.json'), JSON.stringify(evidence, null, 2)); console.log('[course] PASS', JSON.stringify(evidence, null, 2));
} finally { await browser.close(); server?.kill(); }
