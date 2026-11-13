# 验收方案与测试记录

> 本文件原为规划阶段的验收清单；以下记录均已在实际环境中执行。未执行、未通过或无法覆盖的项目与通过项分开列出，不把计划判据当作通过记录。

## 1. 测试环境

| 项目 | 值 |
| --- | --- |
| 日期 | 2026-11-13 |
| 操作系统 | Windows（本地工作区 `D:\AIcoding\电路`） |
| Node.js | v24.14.0 |
| 浏览器 | Google Chrome（Playwright 驱动，headless） |
| 图形后端 | ANGLE / Vulkan SwiftShader（软件 WebGL 2） |
| 视口 | 1600 × 1000 CSS px；实际 canvas 964 × 934、DPR 1 |
| 构建工具 | Vite 7.3.8；TypeScript 5.9.3；Vitest 3.2.7 |
| 依赖版本 | React 19.3.1、Three.js 0.180.0、@react-three/fiber 9.8.2、@react-three/drei 10.7.9 |

> **性能限制：** 本环境为 SwiftShader 软件光栅化，不能代表集成显卡/独立显卡的帧率。因此本次不宣称达到某个 FPS 门槛；只记录软件环境下的绘制统计与功能可用性。

## 2. 自动化命令与结果

| 命令 | 结果 | 说明 |
| --- | --- | --- |
| `npm run typecheck` | 通过 | 严格 TS，无类型错误 |
| `npm test` | **35 / 35 通过** | 4 个测试文件：仿真器、器材与面包板、教学实验、持久化 |
| `npm run build` | 通过 | 生产构建成功，生成 dist/ |
| `npm run test:e2e` | 通过 | 自动启动 Vite；使用系统 Chrome；采集截图并检查交互 |
| `npm run check` | 通过 | typecheck + test + build 的串联命令 |

生产构建产物摘要（实际 `dist/` 输出）：

- Three.js/R3F vendor chunk 约 1.20 MB（gzip 约 338 KB）。
- 应用入口 chunk 约 206 KB（gzip 约 61 KB）；icons 约 21 KB，state 约 0.6 KB。
- CSS 约 45 KB（gzip 约 9.3 KB）。

## 3. 几何与交互验收

| 编号 | 测试项目 | 结果 | 证据 / 说明 |
| --- | --- | --- | --- |
| 3D-01 | 轨道旋转、缩放、平移、重置 | **通过** | OrbitControls 限制俯仰/距离；真实 Chrome 中可用；Home 重置路径执行 |
| 3D-02 | 程序化器材辨识 | **通过** | 默认和近景截图；十一件器材均有独立分件 |
| 3D-03 | 器材拖拽与旋转 | **通过** | 真实鼠标拖动/键盘 R；`InstrumentFrame` 使用稳定 ID；位置 clamp |
| 3D-04 | 导线吸附与端口身份 | **通过** | 真实鼠标从电源 + 拖到开关 A，新增 1 根导线 |
| 3D-05 | 导线随器材移动 | **代码与结构验证** | 曲线端点由 component.port 世界坐标实时派生；未做独立自动化截图回归 |
| 3D-06 | 相机与编辑器输入冲突 | **通过** | 旋钮拖动改变电压且器材位置不变；接线/拖动时 OrbitControls 禁用 |
| 3D-07 | 撤销与重做 | **通过** | 浏览器中 Ctrl+Z / Ctrl+Shift+Z 对拖线进行回归 |
| UX-01 | 从空实验台完成 E01 | **通过（示范接线流程）** | E01 示范 6 线；真实端口拖线测试 1 线；记录数据通过教学判定 5/5 |
| UX-02 | 改变开关 / 参数后的响应 | **通过** | 3D 摇板关闭时设备输出标志为 false；3D 旋钮 6→11.5 V 重新求解 |
| UX-03 | 错误接线与诊断 | **通过（引擎/单测）** | 超量程、电流表大压降、短路、悬空子网、无效端点均有诊断；浏览器通过 UI 诊断显示路径可查看 |
| UX-04 | 实验数据记录与导出 | **通过（CSV）** | 记录 U/I/R；CSV 下载文件名 `circuitlab-rc-measurements.csv` |
| UX-05 | 保存与重新打开 | **通过** | localStorage 保存后刷新，恢复 6 器材、7 导线、1 记录并重新求解 |
| UX-06 | 自由搭建 | **通过** | 浏览器切换自由模式/返回指导模式；共享同一仿真与器材状态 |

补充交互检查（开发期隔离脚本）：

- 电源 3D 旋钮：6 V → 11.4 V，器材位置不变。
- 电源 3D 摇板：输出由开 → 关，设备状态灯与屏幕 OFF。
- 电阻箱十进制旋钮：点击 1000 Ω 的千位旋钮 → 2000 Ω。
- 滑动变阻器：水平拖动滑片，position 0.5 → 0.65。
- LED：13.57 mA 时显示 45% 相对亮度，封装与光晕可见。
- 小灯泡：约 0.299 W 时亮度约 99.7%，出现灯丝与柔和光晕。

## 4. 电学求解验收

所有以下结果均来自真实求解器或自动测试，不依赖固定读数。

| 编号 | 场景 | 结果 | 实测/约束 |
| --- | --- | --- | --- |
| SIM-01 | 10 V + 1 kΩ | **通过** | ≈10 mA；端电压≈10 V（理想内阻测试） |
| SIM-02 | 5 V + 1 kΩ | **通过** | ≈5 mA |
| SIM-03 | 10 V + 两个 1 kΩ 串联 | **通过** | 总电流≈5 mA；每个分压≈5 V |
| SIM-04 | 10 V + 两个 1 kΩ 并联 | **通过** | 总电流≈20 mA；各≈10 mA |
| SIM-05 | 断开串联开关 | **通过** | 支路电流为 0；电源端仍有电压 |
| SIM-06 | 电源输出短路 | **通过** | 有限电流、短路诊断；无 NaN/Infinity |
| SIM-07 | 无源/浮置网络 | **通过** | 独立参考地、0 V/0 A 或浮置诊断 |
| SIM-08 | 电压表并联 / 电流表串联 | **通过** | 电压表读数≈电阻端电压；电流表≈主回路电流 |
| SIM-09 | 修改电源电压/电阻 | **通过** | 重新求解；6 V→10 V 电流从 5 mA→10 mA 回归 |
| SIM-10 | 断线 / 换线 | **通过** | 浏览器实际拖线、撤销、重做；节点重新合并 |
| SIM-11 | 电流表误并联 | **通过** | `ammeter-large-voltage` 警告 + 有限读数 |
| SIM-12 | 独立电容直流状态 | **通过** | 不再因为开路电容造成奇异矩阵 |
| SIM-13 | 面包板内部连通 | **通过** | 同列 5 孔导通；不同列隔离；电源轨纵向连通 |
| SIM-14 | 滑动变阻器 | **通过** | 50% 位置≈50 Ω 段；100% 位置≈100 Ω 段 |

### 教学判定

| 实验 | 装配 / 求解 | 教学步骤 |
| --- | --- | --- |
| E01 欧姆定律 | 通过 | 示范接线 + 记录后 5/5；反算 R≈999.9 Ω |
| E02 串联分压 | 通过 | 检查串联电流、分压比和记录数；实现 |
| E03 并联分流 | 通过 | 检查节点等压、干路电流和记录数；实现 |
| E04 KCL/KVL | 通过 | 检查多支路、记录数及联合求解状态；实现 |
| E05 LED 限流 | 通过 | LED 导通与安全电流检查；LED 真实点亮 |
| E06 RC | 通过 | 暂态运行、63.2% 进度与曲线采样；电容电压约 4.9 V |

## 5. 浏览器交互验收输出摘要

```
initial state: 5 components / 0 wires / solved true
renderer: ANGLE SwiftShader (software WebGL 2)
knob voltage: 6 -> 11.5
rocker off: enabled=false, output=false
wired: 6 wires, ammeter≈5.9987 mA, voltmeter≈5.9981 V
measurement: U≈5.998 V, I≈5.999 mA, inferred R≈999.9 Ω
teaching progress: 5 / 5
real 3D port drag: wires 1 -> undo 0 -> redo 1
all labs: solved true / status ok
RC transient: ~51 samples, capacitor voltage≈4.93 V
localStorage restore: 6 components / 7 wires / 1 measurement
CSV: circuitlab-rc-measurements.csv
help modal: opened and closed
free build: entered and returned
console page errors: 0; console errors: 0
```

默认场景渲染统计（软件渲染）：

- 438 draw calls、44,554 triangles、366 geometries、48 textures。
- rAF 约 5 fps（SwiftShader；不可作为硬件性能指标）。
- 全部器材 + RC 场景：574 draw calls、62,684 triangles。
- WebGL 2 context 未丢失。

## 6. 视觉证据

截图位于 [`docs/media/`](media/)：

- `01-overview.jpg`：默认全景。
- `02-wired-ohm.jpg`：欧姆定律示范接线与实时读数。
- `03-data-record.jpg`：U/I/R 记录与教学数据页。
- `04-power-supply.jpg`：电源前面板、旋钮、接线柱和导线的近景。
- `05-instrument-gallery.jpg`：所有程序化器材总览。
- `06-rc-transient.jpg`：RC 曲线与实时仪表。
- `07-led-lit.jpg`：E05 LED 实际点亮。
- `08-bulb-lit.jpg`：灯泡由耗散功率点亮。
- `09-help.jpg`：操作说明面板。
- `10-kirchhoff.jpg`：E04 并联多支路与干路/节点仪表读数。

## 7. 未验证 / 未通过 / 遗留问题

1. **硬件性能**：未在集成显卡笔记本中获取 FPS/内存数据；SwiftShader 结果不用于通过性能门槛。
2. **跨浏览器**：未在 Firefox/Safari 实机测试。
3. **移动端与触屏**：未验证；当前为桌面布局。
4. **视觉回归**：未接入像素级视觉回归系统；近景截图人工检查。
5. **真实时间倍率**：RC 由 50 ms 定时器推进 20 ms 步长；低帧率下仿真时间可能落后墙钟，曲线以仿真时间为准。
6. **接触电阻/导线电阻/温度/电源恒流保护**：未建模。
7. **面包板规模**：42 孔教学板，不是标准全尺寸面包板。
8. **电阻箱旋钮**：点击递增；没有连续拖动多位旋钮的手势。
9. **无障碍**：有快捷键与焦点样式，未完成完整 Keyboard-only 流程与屏幕阅读器验证。

## 8. 里程碑记录

- 阶段：P1–P5 核心 + P6 RC 核心。
- 分支：`main`。
- 测试日期：2026-11-13。
- 设备：本机 Windows + SwiftShader 软件渲染 Chrome。
- 实际测试用例与通过数：**35 个 Vitest 全部通过；浏览器验收脚本整体通过**。
- 截图证据：`docs/media/`。
- 已知问题：见上节。
- 是否允许进入下一阶段：**允许继续做 P6 的硬件性能、跨浏览器与体验完善；不以当前软件渲染数据宣称硬件性能达标。**
