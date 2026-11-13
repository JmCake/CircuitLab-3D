import { useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { getDefinition } from '../../circuit';
import { useLabStore } from '../../store/labStore';
import { LabelPlane } from '../graphics';
import { MATERIALS } from '../materials';
import { InstrumentFeet, Port3D, Screw } from '../parts';
import type { InstrumentModelProps } from './types';

export function Switch({ component }: InstrumentModelProps) {
  const closed = Boolean(component.params.closed);
  const setParam = useLabStore((state) => state.setParam);
  const lever = useRef<THREE.Group>(null);
  const targetAngle = closed ? 0.04 : -0.62;

  useFrame((_, delta) => {
    if (!lever.current) return;
    lever.current.rotation.x = THREE.MathUtils.damp(
      lever.current.rotation.x,
      targetAngle,
      15,
      delta,
    );
  });

  const toggle = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    if (event.button !== 0) return;
    setParam(component.id, 'closed', !closed);
  };

  return (
    <group>
      {/* 电木底座 */}
      <RoundedBox
        args={[0.184, 0.037, 0.112]}
        radius={0.009}
        smoothness={4}
        position={[0, 0.024, 0]}
        material={MATERIALS.darkCeramic}
      />
      <mesh position={[0, 0.0435, 0]} material={MATERIALS.panelDark}>
        <boxGeometry args={[0.166, 0.004, 0.094]} />
      </mesh>
      <InstrumentFeet width={0.17} depth={0.1} y={0.0025} />

      {/* 两侧接线电极 */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * 0.064, 0.047, 0.035]} material={MATERIALS.brass}>
            <boxGeometry args={[0.031, 0.005, 0.048]} />
          </mesh>
          <mesh position={[side * 0.064, 0.052, 0.015]} material={MATERIALS.metalBright}>
            <cylinderGeometry args={[0.0045, 0.0045, 0.02, 12]} />
          </mesh>
          <mesh position={[side * 0.064, 0.061, 0.015]} rotation={[Math.PI / 2, 0, 0]} material={MATERIALS.metalDark}>
            <cylinderGeometry args={[0.008, 0.008, 0.008, 6]} />
          </mesh>
        </group>
      ))}

      {/* 中央枢轴、接触簧片与红色拨杆 */}
      <mesh position={[0, 0.047, -0.018]} material={MATERIALS.metalDark}>
        <boxGeometry args={[0.052, 0.007, 0.032]} />
      </mesh>
      {[-0.025, 0.025].map((x) => (
        <mesh key={x} position={[x, 0.063, -0.018]} material={MATERIALS.metalBright}>
          <boxGeometry args={[0.007, 0.034, 0.026]} />
        </mesh>
      ))}
      <mesh position={[0, 0.066, -0.018]} rotation={[0, 0, Math.PI / 2]} material={MATERIALS.steel}>
        <cylinderGeometry args={[0.005, 0.005, 0.065, 16]} />
      </mesh>
      <mesh position={[0, 0.047, 0.025]} material={MATERIALS.brass}>
        <boxGeometry args={[0.028, 0.006, 0.038]} />
      </mesh>

      <group
        ref={lever}
        position={[0, 0.067, -0.018]}
        rotation={[targetAngle, 0, 0]}
        onPointerDown={toggle}
        userData={{ interactive: 'switch-lever' }}
      >
        <mesh position={[0, 0, 0.048]} rotation={[Math.PI / 2, 0, 0]} material={MATERIALS.metalBright}>
          <cylinderGeometry args={[0.0042, 0.005, 0.094, 12]} />
        </mesh>
        <RoundedBox
          args={[0.036, 0.012, 0.046]}
          radius={0.005}
          smoothness={4}
          position={[0, 0.004, 0.096]}
          material={MATERIALS.redPlastic}
        />
        <mesh position={[0, 0.0105, 0.096]} material={MATERIALS.metalDark}>
          <boxGeometry args={[0.018, 0.0015, 0.02]} />
        </mesh>
        <mesh
          position={[0, 0.005, 0.06]}
          onPointerDown={toggle}
          userData={{ skipShadow: true }}
        >
          <boxGeometry args={[0.06, 0.045, 0.16]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>
      </group>

      <LabelPlane
        text="SPST  ·  实验开关"
        width={0.095}
        height={0.009}
        position={[-0.035, 0.027, 0.057]}
        color="#c7bda9"
        fontSize={30}
      />
      <LabelPlane
        text={closed ? 'ON' : 'OFF'}
        width={0.023}
        height={0.009}
        position={[0.066, 0.028, 0.057]}
        color={closed ? '#d6b36e' : '#9a9388'}
        fontSize={34}
        fontWeight={700}
      />
      <LabelPlane text="I" width={0.012} height={0.008} position={[0.02, 0.048, 0.052]} color="#8e866f" fontSize={28} />
      <LabelPlane text="O" width={0.012} height={0.008} position={[-0.02, 0.048, 0.052]} color="#8e866f" fontSize={28} />
      <Screw position={[-0.076, 0.031, 0.052]} scale={0.65} />
      <Screw position={[0.076, 0.031, 0.052]} scale={0.65} />

      {getDefinition('switch').ports.map((port) => (
        <Port3D key={port.key} component={component} port={port} compact />
      ))}
    </group>
  );
}
