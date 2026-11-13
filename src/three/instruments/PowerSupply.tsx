import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { getDefinition } from '../../circuit';
import { useLabStore } from '../../store/labStore';
import { DigitalDisplay, IndicatorLamp, LabelPlane } from '../graphics';
import { MATERIALS } from '../materials';
import {
  DialScale,
  InstrumentFeet,
  KnurledKnob,
  Port3D,
  RockerSwitch,
  Screw,
  ventSlots,
} from '../parts';
import type { InstrumentModelProps } from './types';

const SUPPLY_PORTS = getDefinition('power-supply').ports;

export function PowerSupply({ component, element }: InstrumentModelProps) {
  const setParam = useLabStore((state) => state.setParam);
  const beginControl = useLabStore((state) => state.beginControl);
  const solved = useLabStore((state) => state.result.solved);
  const enabled = Boolean(component.params.enabled);
  const setVoltage = Number(component.params.voltage ?? 0);
  const outputVoltage =
    enabled && typeof element?.flags?.outputVoltage === 'number'
      ? (element.flags.outputVoltage as number)
      : enabled
        ? setVoltage
        : 0;
  const outputCurrent =
    enabled && typeof element?.current === 'number' && Number.isFinite(element.current)
      ? element.current
      : 0;
  const shortCircuit = Boolean(element?.flags?.shortCircuit);
  const angle = THREE.MathUtils.degToRad(140 - (Math.min(20, Math.max(0, setVoltage)) / 20) * 280);

  return (
    <group>
      {/* 机身与底部结构 */}
      <RoundedBox
        args={[0.44, 0.19, 0.30]}
        radius={0.011}
        smoothness={5}
        position={[0, 0.123, 0]}
        material={MATERIALS.shellLight}
      />
      <RoundedBox
        args={[0.446, 0.031, 0.304]}
        radius={0.006}
        smoothness={3}
        position={[0, 0.041, 0]}
        material={MATERIALS.shellShadow}
      />
      <mesh position={[0, 0.057, 0]} material={MATERIALS.panelMid}>
        <boxGeometry args={[0.444, 0.0015, 0.302]} />
      </mesh>
      <InstrumentFeet width={0.44} depth={0.30} y={0.01} />

      {/* 前面板：略微凸起的独立面板与凹陷显示区 */}
      <RoundedBox
        args={[0.408, 0.153, 0.006]}
        radius={0.004}
        smoothness={3}
        position={[0, 0.125, 0.151]}
        material={MATERIALS.shellWarm}
      />
      <mesh position={[0, 0.127, 0.1545]} material={MATERIALS.shellShadow}>
        <boxGeometry args={[0.402, 0.0012, 0.001]} />
      </mesh>

      <LabelPlane
        text="CIRCUITLAB"
        width={0.145}
        height={0.012}
        position={[-0.088, 0.198, 0.1555]}
        color="#4b4841"
        fontSize={54}
        fontWeight={700}
        align="left"
        fontFamily={'"Arial Narrow", "Bahnschrift", sans-serif'}
      />
      <LabelPlane
        text="DC POWER SUPPLY  ·  PS-3205"
        width={0.205}
        height={0.008}
        position={[0.088, 0.198, 0.1555]}
        color="#777269"
        fontSize={30}
        fontWeight={600}
        align="right"
      />

      {/* 两只数字显示屏与凹陷边框 */}
      {[
        {
          x: -0.096,
          label: 'VOLTAGE',
          value: enabled && solved && Number.isFinite(outputVoltage) ? outputVoltage : null,
          unit: 'V' as const,
          color: '#88f2cc',
          warning: false,
        },
        {
          x: 0.055,
          label: 'CURRENT',
          value: enabled && solved && Number.isFinite(outputCurrent) ? outputCurrent : null,
          unit: 'A' as const,
          color: '#ffc26b',
          warning: shortCircuit,
        },
      ].map((screen) => (
        <group key={screen.label}>
          <RoundedBox
            args={[0.132, 0.052, 0.014]}
            radius={0.004}
            smoothness={3}
            position={[screen.x, 0.168, 0.154]}
            material={MATERIALS.panelDark}
          />
          <mesh position={[screen.x, 0.168, 0.1615]} material={MATERIALS.panelInset}>
            <boxGeometry args={[0.121, 0.043, 0.0015]} />
          </mesh>
          <DigitalDisplay
            value={screen.value}
            unit={screen.unit}
            label={screen.label}
            width={0.116}
            height={0.041}
            position={[screen.x, 0.168, 0.1625]}
            color={screen.color}
            off={!enabled}
            warning={screen.warning}
          />
        </group>
      ))}

      {/* 电压调节旋钮与刻度环 */}
      <DialScale
        position={[-0.15, 0.09, 0.1558]}
        radius={0.038}
        startDeg={-140}
        endDeg={140}
        ticks={21}
        majorEvery={5}
        labels={[
          { at: -140, text: '0' },
          { at: 0, text: '10' },
          { at: 140, text: '20' },
        ]}
        color="#49463f"
      />
      <KnurledKnob
        position={[-0.15, 0.09, 0.157]}
        radius={0.027}
        depth={0.022}
        angle={angle}
        onBeginDrag={(x, y) => beginControl(component.id, 'voltage', { x, y }, 'y')}
      />
      <LabelPlane
        text="VOLTAGE"
        width={0.05}
        height={0.007}
        position={[-0.15, 0.051, 0.1562]}
        color="#5f5a51"
        fontSize={30}
      />

      {/* 电源开关、状态灯 */}
      <RockerSwitch
        position={[0.151, 0.108, 0.154]}
        on={enabled}
        onToggle={() => setParam(component.id, 'enabled', !enabled)}
      />
      <LabelPlane
        text="POWER"
        width={0.043}
        height={0.008}
        position={[0.151, 0.132, 0.1555]}
        color="#6d6860"
        fontSize={30}
      />
      <IndicatorLamp position={[0.101, 0.112, 0.159]} color="#77e7a8" on={enabled} size={0.0054} />
      <LabelPlane
        text="ON"
        width={0.025}
        height={0.007}
        position={[0.101, 0.096, 0.1555]}
        color="#7d776d"
        fontSize={28}
      />

      {/* 输出区域与端口 */}
      <LabelPlane
        text="OUTPUT"
        width={0.062}
        height={0.008}
        position={[0.095, 0.084, 0.1555]}
        color="#6e675d"
        fontSize={31}
      />
      {SUPPLY_PORTS.map((port) => (
        <Port3D key={port.key} component={component} port={port} />
      ))}
      <LabelPlane
        text="+"
        width={0.02}
        height={0.012}
        position={[0.135, 0.091, 0.1555]}
        color="#9b3831"
        fontSize={42}
      />
      <LabelPlane
        text="−"
        width={0.02}
        height={0.012}
        position={[0.058, 0.091, 0.1555]}
        color="#3f4141"
        fontSize={42}
      />

      {/* 前面板固定螺钉 */}
      <Screw position={[-0.196, 0.192, 0.154]} />
      <Screw position={[0.196, 0.192, 0.154]} />
      <Screw position={[-0.196, 0.05, 0.154]} />
      <Screw position={[0.196, 0.05, 0.154]} />

      {/* 侧面散热槽 */}
      {ventSlots({
        count: 6,
        slotWidth: 0.0045,
        slotHeight: 0.068,
        gap: 0.0095,
        position: [0.2215, 0.13, 0.0],
        rotation: [0, Math.PI / 2, 0],
      })}
      {ventSlots({
        count: 6,
        slotWidth: 0.0045,
        slotHeight: 0.068,
        gap: 0.0095,
        position: [-0.2215, 0.13, 0.0],
        rotation: [0, -Math.PI / 2, 0],
      })}
      <mesh position={[0.2195, 0.13, -0.042]} material={MATERIALS.metalDark}>
        <boxGeometry args={[0.003, 0.07, 0.085]} />
      </mesh>
      <mesh position={[-0.2195, 0.13, -0.042]} material={MATERIALS.metalDark}>
        <boxGeometry args={[0.003, 0.07, 0.085]} />
      </mesh>

      {/* 后部电源入口、散热与铭牌 */}
      <mesh position={[0, 0.135, -0.1515]} material={MATERIALS.panelDark}>
        <boxGeometry args={[0.388, 0.112, 0.005]} />
      </mesh>
      {ventSlots({
        count: 13,
        slotWidth: 0.004,
        slotHeight: 0.055,
        gap: 0.0075,
        position: [0.05, 0.137, -0.1545],
        rotation: [0, Math.PI, 0],
        material: MATERIALS.panelInset,
      })}
      <mesh position={[-0.125, 0.086, -0.155]} material={MATERIALS.plasticBlack}>
        <boxGeometry args={[0.043, 0.036, 0.012]} />
      </mesh>
      <mesh position={[-0.125, 0.086, -0.162]} material={MATERIALS.metalDark}>
        <boxGeometry args={[0.022, 0.017, 0.006]} />
      </mesh>
      <mesh position={[-0.125, 0.132, -0.155]} rotation={[Math.PI / 2, 0, 0]} material={MATERIALS.plasticDarkGray}>
        <cylinderGeometry args={[0.014, 0.014, 0.016, 6]} />
      </mesh>
      <LabelPlane
        text={'DC OUTPUT  0–20 V  /  3 A MAX\nFLOATING SUPPLY  ·  CLASS I'}
        width={0.16}
        height={0.018}
        position={[-0.02, 0.176, -0.156]}
        rotation={[0, Math.PI, 0]}
        color="#b1aca1"
        fontSize={27}
        align="center"
      />

      {/* 顶部接缝与一个低矮提手 */}
      <mesh position={[0, 0.219, -0.04]} material={MATERIALS.shellShadow}>
        <boxGeometry args={[0.36, 0.002, 0.006]} />
      </mesh>
      <mesh position={[0, 0.236, -0.115]} material={MATERIALS.metalDark}>
        <boxGeometry args={[0.225, 0.009, 0.018]} />
      </mesh>
      {[-0.095, 0.095].map((x) => (
        <mesh key={x} position={[x, 0.228, -0.115]} material={MATERIALS.metal}>
          <boxGeometry args={[0.014, 0.017, 0.02]} />
        </mesh>
      ))}
    </group>
  );
}
