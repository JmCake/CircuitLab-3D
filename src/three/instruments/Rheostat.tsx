import { useEffect, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { getDefinition } from '../../circuit';
import { useLabStore } from '../../store/labStore';
import { LabelPlane, useDrawTexture } from '../graphics';
import { MATERIALS } from '../materials';
import { InstrumentFeet, Port3D, Screw } from '../parts';
import type { InstrumentModelProps } from './types';

function Winding() {
  const geometry = useMemo(() => {
    const points: THREE.Vector3[] = [];
    const turns = 28;
    const steps = 420;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const angle = t * Math.PI * 2 * turns;
      const x = -0.105 + t * 0.21;
      points.push(new THREE.Vector3(x, 0.145 + Math.cos(angle) * 0.0355, -0.012 + Math.sin(angle) * 0.0355));
    }
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    return new THREE.TubeGeometry(curve, 620, 0.00155, 5, false);
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={MATERIALS.coilWire} />;
}

function ScaleStrip({ maxResistance }: { maxResistance: number }) {
  const texture = useDrawTexture(
    1024,
    96,
    (ctx) => {
      ctx.clearRect(0, 0, 1024, 96);
      const gradient = ctx.createLinearGradient(0, 0, 0, 96);
      gradient.addColorStop(0, '#e4ddcd');
      gradient.addColorStop(1, '#d1c8b5');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 1024, 96);
      ctx.strokeStyle = 'rgba(105, 96, 80, 0.48)';
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, 1020, 92);
      ctx.strokeStyle = '#5d5546';
      ctx.fillStyle = '#453f35';
      ctx.lineWidth = 2.5;
      for (let i = 0; i <= 20; i += 1) {
        const x = 28 + (i / 20) * 968;
        const major = i % 5 === 0;
        ctx.lineWidth = major ? 3 : 1.5;
        ctx.beginPath();
        ctx.moveTo(x, 8);
        ctx.lineTo(x, major ? 35 : 23);
        ctx.stroke();
        if (major) {
          ctx.font = '650 23px "Arial Narrow", "Microsoft YaHei", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(((i / 20) * maxResistance).toFixed(0), x, 62);
        }
      }
      ctx.font = '600 21px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillStyle = '#5d5546';
      ctx.fillText('Ω  ·  滑动标尺', 1002, 88);
    },
    [maxResistance],
  );
  return (
    <mesh
      position={[0, 0.0478, 0.058]}
      rotation={[-Math.PI / 2, 0, 0]}
      userData={{ skipShadow: true }}
      raycast={() => undefined}
    >
      <planeGeometry args={[0.245, 0.026]} />
      <meshStandardMaterial map={texture} roughness={0.7} metalness={0.02} />
    </mesh>
  );
}

export function Rheostat({ component }: InstrumentModelProps) {
  const maxResistance = Math.max(5, Number(component.params.maxResistance ?? 50));
  const position = Math.min(1, Math.max(0, Number(component.params.position ?? 0.5)));
  const beginControl = useLabStore((state) => state.beginControl);
  const carriage = useRef<THREE.Group>(null);
  const targetX = -0.095 + position * 0.19;

  useFrame((_, delta) => {
    if (!carriage.current) return;
    carriage.current.position.x = THREE.MathUtils.damp(carriage.current.position.x, targetX, 18, delta);
  });

  const startSlide = (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    beginControl(component.id, 'position', {
      x: event.nativeEvent.clientX,
      y: event.nativeEvent.clientY,
    }, 'x');
  };

  return (
    <group>
      {/* 绝缘底座 */}
      <RoundedBox
        args={[0.35, 0.036, 0.17]}
        radius={0.008}
        smoothness={4}
        position={[0, 0.026, 0]}
        material={MATERIALS.darkCeramic}
      />
      <mesh position={[0, 0.045, 0]} material={MATERIALS.panelMid}>
        <boxGeometry args={[0.335, 0.004, 0.155]} />
      </mesh>
      <InstrumentFeet width={0.33} depth={0.15} y={0.006} />
      <ScaleStrip maxResistance={maxResistance} />

      {/* 陶瓷绕组管 */}
      <group position={[0, 0.145, -0.012]} rotation={[0, 0, Math.PI / 2]}>
        <mesh material={MATERIALS.ceramic}>
          <cylinderGeometry args={[0.032, 0.032, 0.235, 28]} />
        </mesh>
        <mesh position={[0, 0.119, 0]} material={MATERIALS.metalDark}>
          <cylinderGeometry args={[0.038, 0.038, 0.006, 24]} />
        </mesh>
        <mesh position={[0, -0.119, 0]} material={MATERIALS.metalDark}>
          <cylinderGeometry args={[0.038, 0.038, 0.006, 24]} />
        </mesh>
      </group>
      <Winding />

      {/* 两端支架与导杆 */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * 0.126, 0.093, 0.053]} material={MATERIALS.metalDark}>
            <boxGeometry args={[0.013, 0.12, 0.018]} />
          </mesh>
          <mesh position={[side * 0.126, 0.159, 0.053]} material={MATERIALS.metalBright}>
            <boxGeometry args={[0.027, 0.016, 0.032]} />
          </mesh>
          <mesh position={[side * 0.096, 0.081, 0.074]} material={MATERIALS.brass}>
            <boxGeometry args={[0.055, 0.005, 0.012]} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.178, 0.053]} rotation={[0, 0, Math.PI / 2]} material={MATERIALS.metalBright}>
        <cylinderGeometry args={[0.005, 0.005, 0.27, 16]} />
      </mesh>
      <mesh position={[0, 0.153, 0.015]} rotation={[0, 0, Math.PI / 2]} material={MATERIALS.metalDark}>
        <cylinderGeometry args={[0.0035, 0.0035, 0.25, 12]} />
      </mesh>

      {/* 滑片组件 */}
      <group ref={carriage} position={[targetX, 0, 0]} onPointerDown={startSlide}>
        <mesh position={[0, 0.177, 0.053]} material={MATERIALS.metalDark}>
          <boxGeometry args={[0.034, 0.023, 0.032]} />
        </mesh>
        <mesh position={[0, 0.189, 0.053]} material={MATERIALS.shellWarm}>
          <boxGeometry args={[0.024, 0.012, 0.024]} />
        </mesh>
        <mesh position={[0, 0.151, 0.028]} rotation={[0.6, 0, 0]} material={MATERIALS.brass}>
          <boxGeometry args={[0.009, 0.033, 0.004]} />
        </mesh>
        <mesh position={[0, 0.141, 0.009]} rotation={[0.2, 0, 0]} material={MATERIALS.copper}>
          <boxGeometry args={[0.014, 0.004, 0.03]} />
        </mesh>
        <mesh position={[0, 0.203, 0.053]} rotation={[Math.PI / 2, 0, 0]} material={MATERIALS.redPlasticDark}>
          <cylinderGeometry args={[0.012, 0.012, 0.009, 20]} />
        </mesh>
        <mesh position={[0, 0.207, 0.071]} material={MATERIALS.metalBright}>
          <boxGeometry args={[0.0028, 0.015, 0.002]} />
        </mesh>
        <mesh
          position={[0, 0.19, 0.053]}
          onPointerDown={startSlide}
          userData={{ skipShadow: true }}
        >
          <boxGeometry args={[0.065, 0.085, 0.08]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>
      </group>

      {/* 滑片位置指示与标尺 */}
      <mesh
        position={[0.136, 0.06, 0.035]}
        material={MATERIALS.metal}
      >
        <boxGeometry args={[0.002, 0.045, 0.06]} />
      </mesh>
      <mesh position={[-0.035, 0.031, 0.0862]} material={MATERIALS.brass}>
        <boxGeometry args={[0.16, 0.013, 0.0014]} />
      </mesh>
      <LabelPlane
        text="SLIDING RHESOSTAT"
        width={0.145}
        height={0.009}
        position={[-0.035, 0.031, 0.0872]}
        color="#332d24"
        fontSize={31}
        fontWeight={700}
        align="center"
      />
      <LabelPlane
        text={`${maxResistance.toFixed(0)} Ω  ·  MAX 0.8 A`}
        width={0.1}
        height={0.008}
        position={[-0.06, 0.0155, 0.0865]}
        color="#c5b496"
        fontSize={28}
        align="left"
      />
      <LabelPlane
        text={`${Math.round(position * 100)} %`}
        width={0.045}
        height={0.01}
        position={[0.13, 0.029, 0.0865]}
        color="#d2bc8d"
        fontSize={34}
        align="right"
      />

      {getDefinition('rheostat').ports.map((port) => (
        <Port3D key={port.key} component={component} port={port} compact />
      ))}
      <Screw position={[-0.146, 0.045, 0.084]} scale={0.65} />
      <Screw position={[0.146, 0.045, 0.084]} scale={0.65} />
    </group>
  );
}
