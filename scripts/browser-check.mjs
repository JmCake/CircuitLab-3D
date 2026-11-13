import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { chromium } from 'playwright-core';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'screenshots');
// Without an explicit URL, always test this checkout on a fresh port, never an unrelated running Vite.
const PORT = process.env.CIRCUITLAB_URL ? null : await new Promise((resolve, reject) => {
  const server = createServer();
  server.on('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    server.close(() => resolve(address.port));
  });
});
const URL = process.env.CIRCUITLAB_URL ?? `http://127.0.0.1:${PORT}/`;
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

async function firstExisting(paths) {
  for (const candidate of paths) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // continue
    }
  }
  return null;
}

let devServer = null;

async function serverReady() {
  try {
    const response = await fetch(URL);
    return response.ok;
  } catch {
    return false;
  }
}

async function ensureDevServer() {
  if (process.env.CIRCUITLAB_URL && await serverReady()) return;
  console.log('[check] starting Vite dev server');
  devServer = spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(PORT ?? new globalThis.URL(URL).port), '--strictPort'],
    { cwd: ROOT, stdio: 'inherit' },
  );
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (await serverReady()) return;
  }
  throw new Error('无法启动 Vite 开发服务器');
}

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function shot(page, name) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await page.screenshot({ path: path.join(OUT_DIR, name), timeout: 60000 });
      console.log(`[check] screenshot ${name}`);
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      console.warn(`[check] screenshot retry ${name}: ${error.message}`);
      await page.waitForTimeout(1500);
    }
  }
}

async function clearToasts(page) {
  await page.evaluate(() => window.__circuitlab.store.setState({ toasts: [] }));
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const executablePath = await firstExisting(CHROME_CANDIDATES);
  if (!executablePath) throw new Error('未找到 Chrome/Edge 浏览器');
  await ensureDevServer();
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: [
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--enable-webgl',
      '--disable-dev-shm-usage',
    ],
  });
  try {
    await runCheck(browser);
  } finally {
    await browser.close();
    if (devServer) {
      devServer.kill();
      devServer = null;
    }
  }
}

async function runCheck(browser) {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1,
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(String(error?.stack ?? error)));

  console.log(`[check] opening ${URL}`);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('.scene-canvas canvas', { timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__circuitlab), null, { timeout: 15000 });
  await page.waitForTimeout(2600);

  const initial = await page.evaluate(() => window.__circuitlab.snapshot());
  console.log('[check] initial state', initial);
  assert(initial.components === 5, '默认实验台应包含 5 件 E01 器材');
  assert(initial.wires === 0, '默认实验台不应预先接线');
  assert(initial.solved, '默认无源电路应返回可解状态');
  const gpuInfo = await page.evaluate(() => {
    const canvas = document.querySelector('.scene-canvas canvas');
    const gl = canvas?.getContext('webgl2');
    if (!gl) return null;
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unknown',
      vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : 'unknown',
      stats: window.__circuitlab.renderStats(),
    };
  });
  const fps = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let frames = 0;
        const start = performance.now();
        const tick = (now) => {
          frames += 1;
          if (now - start < 1200) requestAnimationFrame(tick);
          else resolve(frames / ((now - start) / 1000));
        };
        requestAnimationFrame(tick);
      }),
  );
  console.log('[check] renderer', gpuInfo, 'rAF fps', Number(fps.toFixed(1)));
  await shot(page, '01-default.png');

  // 3D 旋钮实际拖动：聚焦电源后读取旋钮投影位置并向上拖动。
  await page.evaluate(() => {
    const api = window.__circuitlab;
    const state = api.store.getState();
    const supply = state.components.find((item) => item.type === 'power-supply');
    state.selectComponent(supply.id);
    api.camera.focus(supply.position);
  });
  await page.waitForTimeout(1800);
  const knobTest = await page.evaluate(() => {
    const state = window.__circuitlab.store.getState();
    const supply = state.components.find((item) => item.type === 'power-supply');
    return {
      supplyId: supply.id,
      startVoltage: Number(supply.params.voltage),
      screen: window.__circuitlab.localScreen(supply.id, [-0.15, 0.09, 0.19]),
    };
  });
  console.log('[check] knob projection', knobTest);
  assert(knobTest.screen, '电压旋钮应可投影到屏幕');
  const [knobX, knobY] = knobTest.screen;
  await page.mouse.move(knobX, knobY);
  await page.waitForTimeout(100);
  await page.mouse.down();
  await page.waitForTimeout(120);
  await page.mouse.move(knobX, knobY - 72, { steps: 12 });
  await page.waitForTimeout(160);
  await page.mouse.up();
  await page.waitForTimeout(300);
  const voltageAfterKnob = await page.evaluate(() => {
    const state = window.__circuitlab.store.getState();
    const supply = state.components.find((item) => item.type === 'power-supply');
    return Number(supply.params.voltage);
  });
  console.log(`[check] knob voltage ${knobTest.startVoltage} -> ${voltageAfterKnob}`);
  assert(
    Math.abs(voltageAfterKnob - knobTest.startVoltage) > 0.5,
    '拖动 3D 电压旋钮后设定电压应改变',
  );
  const supplyStillAt = await page.evaluate(() => {
    const supply = window.__circuitlab.store.getState().components.find(
      (item) => item.type === 'power-supply',
    );
    return supply.position;
  });
  assert(
    Math.abs(supplyStillAt[0] + 0.58) < 1e-6 && Math.abs(supplyStillAt[1] + 0.16) < 1e-6,
    '操作旋钮时器材不应被相机/拖动逻辑移动',
  );

  // 3D 摇板开关：点击关闭输出，再点击恢复。
  const rockerInfo = await page.evaluate(() => {
    const api = window.__circuitlab;
    const supply = api.store.getState().components.find((item) => item.type === 'power-supply');
    return {
      id: supply.id,
      point: api.localScreen(supply.id, [0.151, 0.108, 0.185]),
    };
  });
  const [rockerX, rockerY] = rockerInfo.point;
  await page.mouse.move(rockerX, rockerY);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(500);
  const afterRockerOff = await page.evaluate(() => {
    const state = window.__circuitlab.store.getState();
    const supply = state.components.find((item) => item.type === 'power-supply');
    return { enabled: supply.params.enabled, output: state.result.elements[supply.id]?.flags?.enabled };
  });
  console.log('[check] rocker off', afterRockerOff);
  assert(afterRockerOff.enabled === false && afterRockerOff.output === false, '点击电源开关应关闭输出');
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(500);
  const afterRockerOn = await page.evaluate(() => {
    const supply = window.__circuitlab.store.getState().components.find((item) => item.type === 'power-supply');
    return supply.params.enabled;
  });
  assert(afterRockerOn === true, '再次点击电源开关应恢复输出');

  await page.evaluate(() => {
    const api = window.__circuitlab;
    const state = api.store.getState();
    const supply = state.components.find((item) => item.type === 'power-supply');
    state.setParam(supply.id, 'voltage', 6);
    state.selectComponent(null);
    api.store.setState({ toasts: [] });
    api.camera.reset();
  });
  await page.waitForTimeout(850);

  // 通过真实 UI 点击加载完整示范接线。
  await page.getByRole('tab', { name: '实验' }).click();
  await page.getByRole('button', { name: /载入示范接线/ }).click();
  await page.waitForFunction(() => window.__circuitlab.snapshot().wires === 6, null, {
    timeout: 5000,
  });
  await clearToasts(page);
  await page.waitForTimeout(700);
  const wired = await page.evaluate(() => {
    const state = window.__circuitlab.store.getState();
    const supply = state.components.find((item) => item.type === 'power-supply');
    const resistor = state.components.find((item) => item.type === 'resistor');
    const ammeter = state.components.find((item) => item.type === 'ammeter');
    const voltmeter = state.components.find((item) => item.type === 'voltmeter');
    return {
      snapshot: window.__circuitlab.snapshot(),
      supplyVoltage: state.result.elements[supply.id]?.voltage,
      supplyCurrent: state.result.elements[supply.id]?.current,
      resistorCurrent: state.result.elements[resistor.id]?.current,
      ammeterReading: state.result.elements[ammeter.id]?.reading,
      voltmeterReading: state.result.elements[voltmeter.id]?.reading,
    };
  });
  console.log('[check] wired readouts', wired);
  assert(wired.snapshot.wires === 6, '示范接线应有 6 根导线');
  assert(wired.snapshot.solved, '示范接线应求解成功');
  assert(Math.abs(wired.ammeterReading - 0.005997) < 2e-4, '电流表读数应接近 6 mA');
  assert(
    Math.abs(wired.voltmeterReading - wired.supplyVoltage) < 0.02,
    '电压表读数应接近电源端电压',
  );
  await shot(page, '02-wired.png');

  // 数据记录 + 教学判定闭环。
  await page.getByRole('tab', { name: '数据' }).click();
  await page.getByRole('button', { name: /记录当前读数/ }).click();
  await page.waitForTimeout(500);
  await clearToasts(page);
  const afterRecord = await page.evaluate(() => {
    const state = window.__circuitlab.store.getState();
    const row = state.measurements[state.measurements.length - 1];
    return {
      snapshot: window.__circuitlab.snapshot(),
      row,
    };
  });
  console.log('[check] measurement', afterRecord);
  assert(afterRecord.snapshot.measurements === 1, '点击记录后测量表应新增一行');
  assert(afterRecord.row?.voltage > 5, '记录电压应来自实际电压表读数');
  assert(afterRecord.row?.current > 0.004, '记录电流应来自实际电流表读数');
  const measuredResistance = Math.abs(afterRecord.row.voltage / afterRecord.row.current);
  assert(
    Math.abs(measuredResistance - 1000) < 15,
    `由 U/I 计算的电阻应接近 1000 Ω，实际 ${measuredResistance.toFixed(1)}`,
  );
  await shot(page, '03-data.png');

  await page.getByRole('tab', { name: '实验' }).click();
  await page.waitForTimeout(250);
  const progress = await page.locator('.lab-progress-row strong').innerText();
  console.log('[check] teaching progress', progress);
  assert(progress.replace(/\s/g, '') === '5/5', '完成示范接线并记录后教学步骤应 5/5');
  await shot(page, '04-lab-complete.png');

  // 真实鼠标接线 + 撤销/重做。
  await page.evaluate(() => {
    window.__circuitlab.store.getState().loadLab('ohms-law', false);
  });
  await page.waitForTimeout(450);
  await page.evaluate(() => window.__circuitlab.camera.reset());
  await page.waitForTimeout(650);
  const ports = await page.evaluate(() => {
    const state = window.__circuitlab.store.getState();
    const supply = state.components.find((item) => item.type === 'power-supply');
    const sw = state.components.find((item) => item.type === 'switch');
    const from = `${supply.id}:positive`;
    const to = `${sw.id}:a`;
    return {
      from,
      to,
      fromScreen: window.__circuitlab.portScreen(from),
      toScreen: window.__circuitlab.portScreen(to),
    };
  });
  console.log('[check] wiring screen coordinates', ports);
  assert(ports.fromScreen && ports.toScreen, '接线柱必须能投影到屏幕坐标');
  const [sx, sy] = ports.fromScreen;
  const [ex, ey] = ports.toScreen;
  await page.mouse.move(sx, sy);
  await page.waitForTimeout(100);
  await page.mouse.down();
  await page.waitForTimeout(160);
  await page.mouse.move(ex, ey, { steps: 22 });
  await page.waitForTimeout(220);
  await page.mouse.up();
  await page.waitForTimeout(550);
  const afterDrag = await page.evaluate(() => window.__circuitlab.snapshot());
  console.log('[check] after real 3D drag', afterDrag);
  assert(afterDrag.wires === 1, '拖拽接线应新增 1 根导线');

  await page.keyboard.press('Control+z');
  await page.waitForTimeout(260);
  const afterUndo = await page.evaluate(() => window.__circuitlab.snapshot());
  assert(afterUndo.wires === 0, '撤销后导线应回到 0 根');
  await page.keyboard.press('Control+Shift+z');
  await page.waitForTimeout(260);
  const afterRedo = await page.evaluate(() => window.__circuitlab.snapshot());
  assert(afterRedo.wires === 1, '重做后导线应恢复');

  // 电源近景。
  await page.evaluate(() => {
    const api = window.__circuitlab;
    const state = api.store.getState();
    state.loadLab('ohms-law', true);
    api.store.setState({ toasts: [], selectedId: null, sideTab: 'lab' });
    api.camera.reset();
  });
  await page.waitForTimeout(450);
  await page.evaluate(() => {
    const api = window.__circuitlab;
    const state = api.store.getState();
    const supply = state.components.find((item) => item.type === 'power-supply');
    api.store.getState().selectComponent(supply.id);
    api.camera.focus(supply.position);
  });
  await page.waitForTimeout(1400);
  await clearToasts(page);
  await shot(page, '05-supply-closeup.png');

  // 所有器材模型总览。
  await page.evaluate(() => {
    const api = window.__circuitlab;
    const store = api.store;
    store.getState().clearBench();
    const placements = [
      ['resistor-box', [-0.62, -0.16]],
      ['rheostat', [-0.12, -0.21]],
      ['capacitor', [0.34, -0.21]],
      ['led', [0.56, -0.04]],
      ['bulb', [0.65, 0.20]],
      ['breadboard', [-0.42, 0.19]],
    ];
    for (const [type, position] of placements) {
      store.getState().addComponent(type, position);
    }
    store.setState({ toasts: [], selectedId: null, sideTab: 'lab' });
    api.camera.reset();
  });
  await page.waitForTimeout(1400);
  await shot(page, '06-all-instruments.png');

  // 逐个载入所有教学实验示范接线，验证统一求解器。
  const labIds = ['ohms-law', 'series', 'parallel', 'kirchhoff', 'led', 'rc', 'thevenin', 'superposition', 'max-power'];
  for (const labId of labIds) {
    const labState = await page.evaluate((id) => {
      const api = window.__circuitlab;
      api.store.getState().loadLab(id, true);
      const state = api.store.getState();
      const led = state.components.find((component) => component.type === 'led');
      return {
        labId: id,
        active: state.activeLabId,
        componentCount: state.components.length,
        wireCount: state.wires.length,
        solved: state.result.solved,
        status: state.result.status,
        ledOn: led ? Boolean(state.result.elements[led.id]?.flags?.on) : null,
      };
    }, labId);
    console.log('[check] lab', labState);
    assert(labState.active === labId, `${labId} 应设为当前实验`);
    assert(labState.componentCount > 0 && labState.wireCount > 0, `${labId} 应有器材与导线`);
    assert(labState.solved, `${labId} 示范接线应求解成功`);
    if (labId === 'led') assert(labState.ledOn === true, 'LED 限流示范应点亮 LED');
  }

  // RC 暂态 + 曲线。
  await page.evaluate(() => {
    const api = window.__circuitlab;
    api.store.getState().loadLab('rc', true);
    api.store.setState({ sideTab: 'data', selectedId: null, toasts: [] });
    api.camera.reset();
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__circuitlab.store.getState().startTransient());
  await page.waitForTimeout(3200);
  await clearToasts(page);
  const rc = await page.evaluate(() => {
    const state = window.__circuitlab.store.getState();
    const cap = state.components.find((item) => item.type === 'capacitor');
    return {
      time: state.transient.time,
      samples: state.transient.samples.length,
      capVoltage: state.transient.capacitorVoltages[cap.id],
      running: state.transient.running,
    };
  });
  console.log('[check] RC transient', rc);
  assert(rc.samples > 5, 'RC 暂态应采集多个时间步');
  assert(rc.capVoltage > 0, 'RC 电容电压应上升');
  await shot(page, '07-rc.png');

  // 保存到 localStorage 后刷新恢复。
  const beforeReload = await page.evaluate(() => {
    const api = window.__circuitlab;
    const state = api.store.getState();
    const snapshot = api.snapshot();
    state.saveLocal();
    return snapshot;
  });
  await page.waitForTimeout(450);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.scene-canvas canvas', { timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__circuitlab), null, { timeout: 15000 });
  await page.waitForTimeout(1300);
  const afterReload = await page.evaluate(() => window.__circuitlab.snapshot());
  console.log('[check] localStorage restore', { beforeReload, afterReload });
  assert(afterReload.components === beforeReload.components, '刷新后器材数量应恢复');
  assert(afterReload.wires === beforeReload.wires, '刷新后导线拓扑应恢复');
  assert(afterReload.measurements === beforeReload.measurements, '刷新后数据记录应恢复');

  const canvasInfo = await page.evaluate(() => {
    const canvas = document.querySelector('.scene-canvas canvas');
    if (!canvas) return null;
    const gl = canvas.getContext('webgl2');
    const debug = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      width: canvas.width,
      height: canvas.height,
      contextLost: gl?.isContextLost?.() ?? null,
      renderer: gl && debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unknown',
      stats: window.__circuitlab.renderStats(),
    };
  });
  console.log('[check] canvas', canvasInfo);

  // CSV 导出
  await page.getByRole('tab', { name: '数据' }).click();
  await page.waitForTimeout(500);
  const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
  await page.getByRole('button', { name: /导出 CSV/ }).click();
  const download = await downloadPromise;
  console.log('[check] CSV download', download.suggestedFilename());
  assert(download.suggestedFilename().endsWith('.csv'), '导出文件应为 CSV');

  // 帮助面板
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
  await page.keyboard.press('h');
  await page.waitForSelector('.help-modal', { timeout: 3000 });
  await shot(page, '09-help.png');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.help-modal', { state: 'detached', timeout: 3000 });

  // 自由搭建模式
  await page.getByRole('button', { name: '自由搭建' }).click();
  await page.waitForSelector('.free-hero', { timeout: 3000 });
  assert(
    (await page.locator('.free-hero h2').innerText()).includes('自由搭建'),
    '自由模式面板应可见',
  );
  await page.getByRole('button', { name: /^指导实验$/ }).click();
  await page.waitForSelector('.free-hero', { state: 'detached', timeout: 3000 });

  if (pageErrors.length > 0) {
    console.error('[check] page errors');
    for (const error of pageErrors) console.error(error);
  }
  if (consoleErrors.length > 0) {
    console.error('[check] console errors');
    for (const error of consoleErrors) console.error(error);
  }
  if (pageErrors.length > 0 || consoleErrors.length > 0) {
    throw new Error(`浏览器控制台存在 ${pageErrors.length} 个异常、${consoleErrors.length} 个错误`);
  }
  console.log('[check] PASS');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
