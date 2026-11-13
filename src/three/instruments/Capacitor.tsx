import { useEffect, useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { getDefinition } from '../../circuit';
import { LabelPlane } from '../graphics';
import { MATERIALS } from '../materials';
import { InstrumentFeet, Port3D, Screw } from '../parts';
import type { InstrumentModelProps } from './types';

function Lead({ side }: { side: -1 | 1 }) {
  const geometry = useMemo(() => {
    const points = [
      new THREE.Vector3(side * 0.018, 0.057, -0.005),
      new THREE.Vector3(side * 0.027, 0.044, 0.01),
      new THREE.Vector3(side * 0.045, 0.035, 0.054),
      new THREE.Vector3(side * 0.045, 0.031, 0.078),
    ];
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    return new THREE.TubeGeometry(curve, 24, 0.0018, 7, false);
  }, [side]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={MATERIALS.metalBright} />;
}

export function Capacitor({ component }: InstrumentModelProps) {
  const capacitance = Number(component.params.capacitanceUf ?? 220);
  const rating = Number(component.params.voltageRating ?? 25);
  const ports = getDefinition('capacitor').ports;
  return (
    <group>
      {/* 底座 */}
      <RoundedBox
        args={[0.174, 0.027, 0.13]}
        radius={0.007}
        smoothness={3}
        position={[0, 0.017, 0]}
        material={MATERIALS.darkCeramic}
      />
      <mesh position={[0, 0.031, 0]} material={MATERIALS.panelDark}>
        <boxGeometry args={[0.16, 0.003, 0.115]} />
      </mesh>
      <InstrumentFeet width={0.16} depth={0.11} y={0.006} />
      <Screw position={[-0.073, 0.032, 0.056]} scale={0.55} />
      <Screw position={[0.073, 0.032, 0.056]} scale={0.55} />

      {/* 电解电容本体 */}
      <mesh position={[0, 0.105, -0.005]} material={MATERIALS.bluePlastic}>
        <cylinderGeometry args={[0.044, 0.044, 0.118, 36]} />
      </mesh>
      <mesh position={[0, 0.165, -0.005]} material={MATERIALS.metal}>
        <cylinderGeometry args={[0.0445, 0.0445, 0.004, 36]} />
      </mesh>
      <mesh position={[0, 0.168, -0.005]} material={MATERIALS.shellShadow}>
        <cylinderGeometry args={[0.038, 0.04, 0.0025, 32]} />
      </mesh>
      <mesh position={[0, 0.170, -0.005]} rotation={[0, Math.PI / 4, 0]} material={MATERIALS.panelDark}>
        <boxGeometry args={[0.045, 0.0015, 0.0018]} />
      </mesh>
      <mesh position={[0, 0.1702, -0.005]} rotation={[0, -Math.PI / 4, 0]} material={MATERIALS.panelDark}>
        <boxGeometry args={[0.045, 0.0015, 0.0018]} />
      </mesh>
      <mesh position={[0, 0.1695, -0.005]} rotation={[0, Math.PI / 4, 0]} material={MATERIALS.metalDark}>
        <boxGeometry args={[0.041, 0.0015, 0.0045]} />
      </mesh>
      <mesh position={[0, 0.073, -0.005]} material={MATERIALS.plasticBlack}>
        <cylinderGeometry args={[0.05, 0.05, 0.009, 32]} />
      </mesh>

      {/* 包覆套管与负极极性色带 */}
      <mesh position={[0, 0.106, -0.005]} material={MATERIALS.pcbDark}>
        <cylinderGeometry args={[0.0446, 0.0446, 0.086, 36, 1, true]} />
      </mesh>
      <mesh position={[0, 0.106, -0.005]}>
        <cylinderGeometry args={[0.0451, 0.0451, 0.102, 36, 1, true, 0.45, 0.52]} />
        <meshStandardMaterial color="#c9d7d4" roughness={0.5} metalness={0.02} side={THREE.DoubleSide} />
      </mesh>
      {[0.13, 0.108, 0.086].map((y) => (
        <group key={y} position={[0, y, -0.005]} rotation={[0, 0.32, 0]}>
          <mesh position={[0.0432, 0, 0.018]} material={MATERIALS.bluePlastic}>
            <boxGeometry args={[0.0018, 0.006, 0.015]} />
          </mesh>
        </group>
      ))}
      <LabelPlane
        text={`${capacitance.toFixed(0)} µF\n${rating} V  ·  105°C`}
        width={0.047}
        height={0.036}
        position={[0.012, 0.118, 0.0412]}
        color="#dce3dc"
        fontSize={27}
        fontWeight={600}
        lineHeight={1.25}
      />
      <LabelPlane
        text="−"
        width={0.018}
        height={0.013}
        position={[-0.024, 0.125, 0.0425]}
        color="#f1ece0"
        fontSize={42}
        fontWeight={700}
      />
      <mesh position={[0, 0.177, -0.005]} material={MATERIALS.metalDark}>
        <sphereGeometry args={[0.005, 12, 8]} />
      </mesh>

      <Lead side={-1} />
      <Lead side={1} />

      <LabelPlane
        text="ELECTROLYTIC CAPACITOR"
        width={0.125}
        height={0.008}
        position={[-0.012, 0.035, 0.067]}
        color="#cdbf9f"
        fontSize={27}
        align="left"
      />
      <LabelPlane
        text="+"
        width={0.016}
        height={0.012}
        position={[-0.045, 0.052, 0.068]}
        color="#b14b3e"
        fontSize={38}
      />
      <LabelPlane
        text="−"
        width={0.016}
        height={0.012}
        position={[0.045, 0.052, 0.068]}
        color="#86837c"
        fontSize={38}
      />

      {ports.map((port) => (
        <Port3D key={port.key} component={component} port={port} compact />
      ))}
    </group>
  );
}
