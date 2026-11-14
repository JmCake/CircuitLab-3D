import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';

const port = process.env.CIRCUITLAB_URL ? null : await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.on('error', reject);
  probe.listen(0, '127.0.0.1', () => { const address = probe.address(); probe.close(() => resolve(address.port)); });
});
const url = process.env.CIRCUITLAB_URL ?? `http://127.0.0.1:${port}/`;
let server;
if (!process.env.CIRCUITLAB_URL) {
  let startup = '';
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', b => { startup = (startup + b).slice(-4000); }); server.stderr.on('data', b => { startup = (startup + b).slice(-4000); });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { ready = (await fetch(url)).ok; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!ready) { server.kill(); throw new Error('Vite failed to start: ' + startup); }
}
const out = path.resolve(process.env.CIRCUITLAB_WIRE_OUT ?? 'screenshots/wire-fix');
await fs.mkdir(out, { recursive: true });
let executablePath;
for (const p of [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)) {
  try { await fs.access(p); executablePath = p; break; } catch {}
}
assert(executablePath, 'System Chrome required');
const browser = await chromium.launch({ executablePath, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const evidence = { labs: [], interactions: [], errors: [] };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => evidence.errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') evidence.errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => typeof window.__circuitlab?.wireClearance === 'function');
  async function inspect(label) {
    const report = await page.evaluate(() => ({ ...window.__circuitlab.wireClearance(), expected: window.__circuitlab.store.getState().wires.length }));
    assert.equal(report.wires.length, report.expected, `${label}: every electrical wire must render`);
    assert.deepEqual(report.collisions, [], `${label}: actual instrument mesh collisions`);
    return report;
  }
  for (const id of ['ohms-law', 'series', 'parallel', 'kirchhoff', 'led', 'rc', 'thevenin', 'superposition', 'max-power', 'iv-characteristics', 'potentials', 'three-phase-star', 'three-phase-delta']) {
    await page.evaluate(id => window.__circuitlab.store.getState().loadLab(id, true), id);
    await page.waitForFunction(id => { const s = window.__circuitlab.store.getState(); const r = window.__circuitlab.wireClearance(); return r && r.wires.length === s.wires.length && r.wires.every(w => w.id.startsWith(id + '-')); }, id);
    const report = await inspect(id);
    evidence.labs.push({ id, wires: report.wires.length, collisions: report.collisions, bodies: report.bodyMeshes });
    console.log('[wire-check]', id, report.wires.length, 'wires, no mesh collisions');
  }

  // A third, electrically unconnected resistance box blocks existing wires between distant instruments.
  const original = await page.evaluate(() => {
    const api = window.__circuitlab;
    api.store.getState().loadLab('ohms-law', true);
    const positions = { ps: [-0.65, -0.18], sw: [0.65, 0.2], r1: [0.12, -0.3], am: [0.65, -0.25], vm: [-0.65, 0.26] };
    // This is an independent obstruction fixture, not a particular lesson's current presentation pose.
    const rotations = { ps: 0.055, sw: -0.03, r1: 0.02, am: -0.04, vm: 0.03 };
    const workspace = api.store.getState().getWorkspace();
    workspace.components = workspace.components.map(c => { const alias = c.id.slice('ohms-law-'.length); return { ...c, position: positions[alias], rotationY: rotations[alias] }; });
    api.store.getState().importWorkspace(workspace);
    return api.store.getState().result.elements['ohms-law-am'].reading;
  });
  await page.waitForTimeout(250);
  const unobstructed = await inspect('before blocking instrument');
  const blockerId = await page.evaluate(() => {
    const s = window.__circuitlab.store;
    s.getState().addComponent('resistor-box', [0, 0.18]);
    return s.getState().selectedId;
  });
  await page.waitForTimeout(300);
  const blocked = await inspect('after blocking instrument');
  assert.notDeepEqual(blocked.wires.map(w => w.fingerprint), unobstructed.wires.map(w => w.fingerprint), 'unconnected blocker must invalidate wire paths');
  await page.getByRole('button', { name: '透视', exact: true }).click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(out, '01-obstacle-routed.png') });

  const drag = await page.evaluate(id => {
    const api = window.__circuitlab;
    const c = api.store.getState().components.find(c => c.id === id);
    const local = [0.07, 0.184, -0.06];
    return { before: c.position, from: api.localScreen(id, local), to: api.camera.worldToScreen([c.position[0] + local[0] - 0.14, local[1], c.position[1] + local[2] + 0.07]) };
  }, blockerId);
  assert(drag.from && drag.to);
  await page.mouse.move(...drag.from);
  await page.mouse.down();
  await page.mouse.move(...drag.to, { steps: 15 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const afterDrag = await page.evaluate(id => window.__circuitlab.store.getState().components.find(c => c.id === id).position, blockerId);
  assert(Math.hypot(afterDrag[0] - drag.before[0], afterDrag[1] - drag.before[1]) > 0.04, 'actual mouse drag should move blocker');
  const moved = await inspect('actual blocker drag');
  assert.notDeepEqual(moved.wires.map(w => w.fingerprint), blocked.wires.map(w => w.fingerprint));
  evidence.interactions.push({ action: 'mouse-drag-unconnected-box', before: drag.before, after: afterDrag, collisions: moved.collisions });
  await page.keyboard.press('r');
  await page.waitForTimeout(300);
  const rotated = await inspect('blocker rotation');
  assert.notDeepEqual(rotated.wires.map(w => w.fingerprint), moved.wires.map(w => w.fingerprint));
  evidence.interactions.push({ action: 'keyboard-rotate-box', collisions: rotated.collisions });
  const reading = await page.evaluate(() => window.__circuitlab.store.getState().result.elements['ohms-law-am'].reading);
  assert(Math.abs(reading - original) < 1e-8, 'rerouting must preserve electrical topology and readings');
  // Impossible socket access is surfaced instead of drawing a lead through another housing.
  await page.evaluate(id => window.__circuitlab.store.getState().setComponentPosition(id, [-0.52, 0.05]), blockerId);
  await page.locator('.wire-obstruction').waitFor({ state: 'visible' });
  assert.equal((await page.evaluate(() => window.__circuitlab.store.getState().wires.length)), 6);
  await page.evaluate(({ id, p }) => window.__circuitlab.store.getState().setComponentPosition(id, p), { id: blockerId, p: afterDrag });
  await page.locator('.wire-obstruction').waitFor({ state: 'hidden' });
  await inspect('uncover sockets restores wire geometry');
  evidence.interactions.push({ action: 'blocked-socket-warning-and-recovery', preservedWires: 6 });
  await page.screenshot({ path: path.join(out, '02-moved-rotated.png') });
  await page.getByRole('button', { name: '顶视', exact: true }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(out, '03-top-view.png') });
  assert.equal(evidence.errors.length, 0);
  await fs.writeFile(path.join(out, 'evidence.json'), JSON.stringify(evidence, null, 2));
  console.log('[wire-check] PASS', JSON.stringify(evidence, null, 2));
} finally { await browser.close(); server?.kill(); }
