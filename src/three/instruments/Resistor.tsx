import { useMemo, useEffect } from 'react';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { getDefinition } from '../../circuit';
import { LabelPlane } from '../graphics';
import { MATERIALS } from '../materials';
import { InstrumentFeet, Port3D, Screw } from '../parts';
import type { InstrumentModelProps } from './types';

const DIGIT_COLORS = [
  '#191a1a',
  '#6b442b',
  '#b53b32',
  '#d47b31',
  '#d9b93f',
  '#4f7c4b',
  '#3f6485',
  '#735078',
  '#858889',
  '#e7e3d8',
];

const MULTIPLIER_COLORS = ['#c5a65a', '#bebfbd', ...DIGIT_COLORS];

function resistorBands(resistance: number): string[] {
  const safe = Math.max(0.01, Math.abs(resistance));
  const exponent = Math.floor(Math.log10(safe)) - 1;
  const mantissa = Math.round(safe / 10 ** exponent);
  const tens = Math.min(9, Math.max(0, Math.floor(mantissa / 10)));
  const units = Math.min(9, Math.max(0, mantissa % 10));
  const multiplierIndex = Math.min(MULTIPLIER_COLORS.length - 1, Math.max(0, exponent + 2));
  return [
    DIGIT_COLORS[tens],
    DIGIT_COLORS[units],
    MULTIPLIER_COLORS[multiplierIndex],
    '#c5a65a',
  ];
}

function Lead({ side }: { side: -1 | 1 }) {
  const geometry = useMemo(() => {
    const points = [
      new THREE.Vector3(side * 0.074, 0.088, -0.002),
      new THREE.Vector3(side * 0.1, 0.083, 0.005),
      new THREE.Vector3(side * 0.118, 0.061, 0.042),
      new THREE.Vector3(side * 0.12, 0.039, 0.078),
    ];
    const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.35);
    return new THREE.TubeGeometry(curve, 22, 0.0019, 7, false);
  }, [side]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={MATERIALS.metalBright} />;
}

export function Resistor({ component }: InstrumentModelProps) {
  const resistance = Number(component.params.resistance ?? 1000);
  const bands = resistorBands(resistance);
  const ports = getDefinition('resistor').ports;
  const displayValue =
    resistance >= 1_000_000
      ? `${(resistance / 1_000_000).toFixed(2)} MΩ`
      : resistance >= 1000
        ? `${(resistance / 1000).toFixed(resistance % 1000 === 0 ? 0 : 2)} kΩ`
        : `${resistance.toFixed(resistance % 1 === 0 ? 0 : 2)} Ω`;

  return (
    <group>
      {/* 深色底座与橡胶脚 */}
      <RoundedBox
        args={[0.318, 0.024, 0.148]}
        radius={0.007}
        smoothness={3}
        position={[0, 0.015, 0]}
        material={MATERIALS.darkCeramic}
      />
      <mesh position={[0, 0.0275, 0]} material={MATERIALS.panelDark}>
        <boxGeometry args={[0.302, 0.002, 0.132]} />
      </mesh>
      <InstrumentFeet width={0.30} depth={0.13} y={0.005} />
      <Screw position={[-0.14, 0.028, 0.065]} scale={0.7} />
      <Screw position={[0.14, 0.028, 0.065]} scale={0.7} />

      {/* 两侧镀锡支撑柱，帮助电阻悬浮并保持轴向 */}
      {[-0.082, 0.082].map((x) => (
        <group key={x}>
          <mesh position={[x, 0.057, -0.002]} material={MATERIALS.metalDark}>
            <cylinderGeometry args={[0.0035, 0.0045, 0.055, 12]} />
          </mesh>
          <mesh position={[x, 0.03, -0.002]} material={MATERIALS.brass}>
            <cylinderGeometry args={[0.008, 0.008, 0.006, 16]} />
          </mesh>
        </group>
      ))}

      {/* 陶瓷电阻本体 */}
      <group position={[0, 0.088, -0.002]} rotation={[0, 0, Math.PI / 2]}>
        <mesh material={MATERIALS.ceramic}>
          <cylinderGeometry args={[0.0225, 0.0225, 0.137, 28]} />
        </mesh>
        <mesh position={[0, 0.073, 0]} material={MATERIALS.metalBright}>
          <cylinderGeometry args={[0.019, 0.0215, 0.011, 24]} />
        </mesh>
        <mesh position={[0, -0.073, 0]} material={MATERIALS.metalBright}>
          <cylinderGeometry args={[0.0215, 0.019, 0.011, 24]} />
        </mesh>
        <mesh position={[0, 0.079, 0]} material={MATERIALS.ceramic}>
          <sphereGeometry args={[0.018, 20, 12]} />
        </mesh>
        <mesh position={[0, -0.079, 0]} material={MATERIALS.ceramic}>
          <sphereGeometry args={[0.018, 20, 12]} />
        </mesh>
      </group>

      {/* 四道色环 */}
      {bands.map((color, index) => (
        <mesh
          key={index}
          position={[-0.044 + index * 0.028, 0.088, -0.002]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <cylinderGeometry args={[0.0231, 0.0231, index === 3 ? 0.0075 : 0.0095, 28]} />
          <meshStandardMaterial color={color} roughness={index === 3 ? 0.34 : 0.58} metalness={0.04} />
        </mesh>
      ))}

      <Lead side={-1} />
      <Lead side={1} />

      {/* 参数铭牌 */}
      <LabelPlane
        text={`METAL FILM  ·  ${displayValue}  ±1%`}
        width={0.158}
        height={0.013}
        position={[0, 0.032, 0.0775]}
        color="#d8c8a8"
        fontSize={32}
        fontWeight={600}
      />
      <LabelPlane
        text="精密金属膜电阻"
        width={0.085}
        height={0.009}
        position={[0, 0.0185, 0.0775]}
        color="#a79577"
        fontSize={28}
      />
      <LabelPlane
        text="R"
        width={0.02}
        height={0.018}
        position={[-0.135, 0.021, 0.0775]}
        color="#cab58f"
        fontSize={46}
        fontWeight={700}
      />

      {ports.map((port) => (
        <Port3D key={port.key} component={component} port={port} compact />
      ))}
    </group>
  );
}
