import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { getDefinition } from '../../circuit';
import { useLabStore } from '../../store/labStore';
import { DigitalDisplay, LabelPlane } from '../graphics';
import { MATERIALS } from '../materials';
import { DialScale, InstrumentFeet, KnurledKnob, Port3D, Screw, ventSlots } from '../parts';
import type { InstrumentModelProps } from './types';

const DECADES = [
  { multiplier: 1000, label: '×1000' },
  { multiplier: 100, label: '×100' },
  { multiplier: 10, label: '×10' },
  { multiplier: 1, label: '×1' },
];

export function ResistorBox({ component }: InstrumentModelProps) {
  const setParam = useLabStore((state) => state.setParam);
  const resistance = Math.max(0, Math.min(9999, Math.round(Number(component.params.resistance ?? 0))));
  const digits = [
    Math.floor(resistance / 1000) % 10,
    Math.floor(resistance / 100) % 10,
    Math.floor(resistance / 10) % 10,
    resistance % 10,
  ];

  const incrementDigit = (index: number) => {
    const nextDigits = [...digits];
    nextDigits[index] = (nextDigits[index] + 1) % 10;
    const next = nextDigits.reduce((sum, digit, i) => sum + digit * DECADES[i].multiplier, 0);
    setParam(component.id, 'resistance', next);
  };

  return (
    <group>
      <RoundedBox
        args={[0.34, 0.152, 0.25]}
        radius={0.01}
        smoothness={5}
        position={[0, 0.108, 0]}
        material={MATERIALS.shellLight}
      />
      <RoundedBox
        args={[0.346, 0.028, 0.256]}
        radius={0.007}
        smoothness={3}
        position={[0, 0.037, 0]}
        material={MATERIALS.shellShadow}
      />
      <InstrumentFeet width={0.34} depth={0.25} y={0.008} />
      <mesh position={[0, 0.161, 0]} material={MATERIALS.shellShadow}>
        <boxGeometry args={[0.31, 0.003, 0.23]} />
      </mesh>
      {[-0.145, 0.145].map((x) => (
        <mesh key={x} position={[x, 0.17, -0.02]} material={MATERIALS.metalDark}>
          <boxGeometry args={[0.02, 0.01, 0.05]} />
        </mesh>
      ))}
      <mesh position={[0, 0.176, -0.02]} rotation={[0, 0, Math.PI / 2]} material={MATERIALS.metal}>
        <cylinderGeometry args={[0.006, 0.006, 0.26, 12]} />
      </mesh>

      {/* 前面板 */}
      <mesh position={[0, 0.104, 0.128]} material={MATERIALS.panelDark}>
        <boxGeometry args={[0.315, 0.118, 0.007]} />
      </mesh>
      <mesh position={[0, 0.104, 0.132]} material={MATERIALS.shellWarm}>
        <boxGeometry args={[0.302, 0.106, 0.003]} />
      </mesh>
      <LabelPlane
        text="DECADE RESISTANCE BOX"
        width={0.17}
        height={0.008}
        position={[-0.05, 0.151, 0.1345]}
        color="#514d45"
        fontSize={34}
        fontWeight={700}
        align="left"
      />
      <LabelPlane
        text="RB-4"
        width={0.038}
        height={0.008}
        position={[0.118, 0.151, 0.1345]}
        color="#7c756b"
        fontSize={27}
        align="right"
      />

      <RoundedBox
        args={[0.19, 0.046, 0.013]}
        radius={0.004}
        smoothness={3}
        position={[0, 0.129, 0.134]}
        material={MATERIALS.panelInset}
      />
      <DigitalDisplay
        value={resistance}
        unit="Ω"
        label="SET RESISTANCE"
        width={0.181}
        height={0.038}
        position={[0, 0.129, 0.142]}
        color="#d8c47a"
      />

      {/* 四只十进制旋钮 */}
      {DECADES.map((decade, index) => {
        const x = -0.108 + index * 0.072;
        const digit = digits[index];
        const angle = THREE.MathUtils.degToRad(140 - (digit / 9) * 280);
        return (
          <group key={decade.multiplier}>
            <DialScale
              position={[x, 0.087, 0.1355]}
              radius={0.019}
              startDeg={-140}
              endDeg={140}
              ticks={10}
              majorEvery={3}
              labels={[
                { at: -140, text: '0' },
                { at: 140, text: '9' },
              ]}
              color="#544f47"
            />
            <KnurledKnob
              position={[x, 0.087, 0.137]}
              radius={0.0125}
              depth={0.012}
              angle={angle}
              bodyMaterial={MATERIALS.plasticDarkGray}
              onPress={() => incrementDigit(index)}
            />
            <LabelPlane
              text={decade.label}
              width={0.04}
              height={0.011}
              position={[x, 0.059, 0.1356]}
              color="#4e4a42"
              fontSize={33}
              fontWeight={650}
            />
            <LabelPlane
              text={String(digit)}
              width={0.022}
              height={0.011}
              position={[x, 0.0445, 0.1357]}
              color="#f1c777"
              fontSize={42}
              fontWeight={700}
              background="#1d2524"
              border="#71654e"
            />
          </group>
        );
      })}

      <LabelPlane
        text="0–9999 Ω  ·  步进 1 Ω"
        width={0.105}
        height={0.007}
        position={[-0.085, 0.038, 0.1355]}
        color="#898276"
        fontSize={25}
        align="left"
      />

      {getDefinition('resistor-box').ports.map((port) => (
        <Port3D key={port.key} component={component} port={port} compact />
      ))}
      <LabelPlane
        text="A"
        width={0.015}
        height={0.009}
        position={[-0.148, 0.069, 0.1355]}
        color="#6d665b"
        fontSize={32}
      />
      <LabelPlane
        text="B"
        width={0.015}
        height={0.009}
        position={[0.148, 0.069, 0.1355]}
        color="#6d665b"
        fontSize={32}
      />
      <Screw position={[-0.157, 0.151, 0.129]} scale={0.7} />
      <Screw position={[0.157, 0.151, 0.129]} scale={0.7} />
      <Screw position={[-0.157, 0.048, 0.129]} scale={0.7} />
      <Screw position={[0.157, 0.048, 0.129]} scale={0.7} />

      {ventSlots({
        count: 5,
        slotWidth: 0.004,
        slotHeight: 0.07,
        gap: 0.012,
        position: [0.171, 0.1, 0],
        rotation: [0, Math.PI / 2, 0],
      })}
      {ventSlots({
        count: 5,
        slotWidth: 0.004,
        slotHeight: 0.07,
        gap: 0.012,
        position: [-0.171, 0.1, 0],
        rotation: [0, -Math.PI / 2, 0],
      })}
      <LabelPlane
        text="PRECISION  ·  ±0.5%  ·  MAX 0.5 W"
        width={0.145}
        height={0.009}
        position={[0, 0.09, -0.127]}
        rotation={[0, Math.PI, 0]}
        color="#6d665b"
        fontSize={27}
      />
    </group>
  );
}
