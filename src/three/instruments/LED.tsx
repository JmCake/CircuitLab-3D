import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { getDefinition } from '../../circuit';
import { getGlowTexture, LabelPlane } from '../graphics';
import { MATERIALS } from '../materials';
import { InstrumentFeet, Port3D, Screw } from '../parts';
import type { InstrumentModelProps } from './types';
import { useAnimationWake } from '../useAnimationWake';

const LED_COLORS: Record<string, { body: string; emissive: string; glass: string }> = {
  red: { body: '#9d2f27', emissive: '#ff4d38', glass: '#b64a3c' },
  yellow: { body: '#a57c23', emissive: '#ffd34d', glass: '#b8953c' },
  green: { body: '#2c6c3f', emissive: '#5bf58f', glass: '#3d8354' },
  blue: { body: '#2f507c', emissive: '#609cff', glass: '#3e6597' },
};

function LedLead({ side }: { side: -1 | 1 }) {
  const geometry = useMemo(() => {
    const points = [
      new THREE.Vector3(side * 0.011, 0.08, -0.006),
      new THREE.Vector3(side * 0.014, 0.054, -0.002),
      new THREE.Vector3(side * 0.042, 0.037, 0.04),
      new THREE.Vector3(side * 0.042, 0.03, 0.078),
    ];
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    return new THREE.TubeGeometry(curve, 24, 0.0016, 6, false);
  }, [side]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={MATERIALS.metalBright} />;
}

export function LED({ component, element }: InstrumentModelProps) {
  const colorName = typeof component.params.color === 'string' ? component.params.color : 'red';
  const palette = LED_COLORS[colorName] ?? LED_COLORS.red;
  const domeMaterial = useRef<THREE.MeshPhysicalMaterial>(null);
  const bodyMaterial = useRef<THREE.MeshStandardMaterial>(null);
  const glowMaterial = useRef<THREE.SpriteMaterial>(null);
  const glowSprite = useRef<THREE.Sprite>(null);
  const light = useRef<THREE.PointLight>(null);
  const glowTexture = useMemo(() => getGlowTexture(), []);
  const brightness = useRef(0);
  const target = Math.min(1.25, Math.max(0, element?.brightness ?? 0));
  useAnimationWake(target);

  useFrame((state, delta) => {
    brightness.current = THREE.MathUtils.damp(brightness.current, target, 9, delta);
    if (Math.abs(brightness.current - target) > 0.0001) state.invalidate();
    const level = brightness.current;
    if (domeMaterial.current) {
      domeMaterial.current.emissiveIntensity = 0.08 + level * 3.8;
      domeMaterial.current.opacity = 0.42 + level * 0.2;
    }
    if (bodyMaterial.current) {
      bodyMaterial.current.emissiveIntensity = 0.04 + level * 1.7;
    }
    if (glowMaterial.current) glowMaterial.current.opacity = level * 0.72;
    if (glowSprite.current) {
      const size = 0.11 + level * 0.09;
      glowSprite.current.scale.set(size, size, 1);
    }
    if (light.current) light.current.intensity = level * 0.22;
  });

  return (
    <group>
      <RoundedBox
        args={[0.162, 0.024, 0.12]}
        radius={0.006}
        smoothness={3}
        position={[0, 0.015, 0]}
        material={MATERIALS.darkCeramic}
      />
      <mesh position={[0, 0.028, 0]} material={MATERIALS.panelDark}>
        <boxGeometry args={[0.148, 0.003, 0.106]} />
      </mesh>
      <InstrumentFeet width={0.15} depth={0.105} y={0.005} />
      <Screw position={[-0.066, 0.029, 0.049]} scale={0.5} />
      <Screw position={[0.066, 0.029, 0.049]} scale={0.5} />

      {/* 透明封装、法兰与内部芯片 */}
      <mesh position={[0, 0.105, -0.006]} rotation={[Math.PI / 2, 0, 0]} material={MATERIALS.metalDark}>
        <cylinderGeometry args={[0.008, 0.011, 0.046, 12]} />
      </mesh>
      <mesh position={[0, 0.133, -0.006]}>
        <sphereGeometry args={[0.028, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshPhysicalMaterial
          ref={domeMaterial}
          color={palette.glass}
          roughness={0.1}
          metalness={0.04}
          transparent
          opacity={0.45}
          transmission={0.25}
          thickness={0.012}
          clearcoat={1}
          clearcoatRoughness={0.05}
          emissive={palette.emissive}
          emissiveIntensity={0.08}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[0, 0.098, -0.006]}>
        <cylinderGeometry args={[0.0265, 0.0265, 0.032, 28]} />
        <meshPhysicalMaterial
          color={palette.body}
          roughness={0.14}
          metalness={0.02}
          transparent
          opacity={0.62}
          clearcoat={1}
          clearcoatRoughness={0.05}
          emissive={palette.emissive}
          emissiveIntensity={0.08}
        />
      </mesh>
      <mesh position={[0, 0.083, -0.006]}>
        <cylinderGeometry args={[0.032, 0.032, 0.006, 32]} />
        <meshStandardMaterial ref={bodyMaterial} color={palette.body} roughness={0.32} metalness={0.05} emissive={palette.emissive} emissiveIntensity={0.02} />
      </mesh>
      <mesh position={[0, 0.0835, 0.024]} material={MATERIALS.panelInset}>
        <boxGeometry args={[0.012, 0.002, 0.008]} />
      </mesh>
      <mesh position={[0, 0.1, -0.006]} rotation={[Math.PI / 2, 0, 0]} material={MATERIALS.copper}>
        <cylinderGeometry args={[0.0015, 0.0015, 0.044, 8]} />
      </mesh>
      <mesh position={[0.006, 0.116, -0.006]} material={MATERIALS.goldContact}>
        <boxGeometry args={[0.006, 0.005, 0.006]} />
      </mesh>
      <mesh position={[-0.012, 0.098, -0.006]} material={MATERIALS.metalDark}>
        <boxGeometry args={[0.004, 0.03, 0.004]} />
      </mesh>
      <sprite
        ref={glowSprite}
        position={[0, 0.135, 0.015]}
        scale={[0.11, 0.11, 1]}
        raycast={() => undefined}
        renderOrder={12}
      >
        <spriteMaterial
          ref={glowMaterial}
          map={glowTexture}
          color={palette.emissive}
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
      <pointLight ref={light} position={[0, 0.15, 0.04]} color={palette.emissive} intensity={0} distance={0.38} decay={2} />

      <Lead side={-1} />
      <Lead side={1} />

      <LabelPlane
        text="LED MODULE"
        width={0.055}
        height={0.007}
        position={[-0.037, 0.033, 0.061]}
        color="#c7b695"
        fontSize={25}
        align="left"
      />
      <LabelPlane
        text="+"
        width={0.015}
        height={0.01}
        position={[-0.042, 0.056, 0.063]}
        color="#b54a3d"
        fontSize={36}
      />
      <LabelPlane
        text="−"
        width={0.015}
        height={0.01}
        position={[0.042, 0.056, 0.063]}
        color="#8a857b"
        fontSize={36}
      />
      <LabelPlane
        text={colorName === 'red' ? 'RED' : colorName === 'green' ? 'GREEN' : colorName === 'blue' ? 'BLUE' : 'YELLOW'}
        width={0.032}
        height={0.007}
        position={[0.045, 0.033, 0.061]}
        color="#a89a7c"
        fontSize={24}
      />

      {getDefinition('led').ports.map((port) => (
        <Port3D key={port.key} component={component} port={port} compact />
      ))}
    </group>
  );
}

function Lead({ side }: { side: -1 | 1 }) {
  return <LedLead side={side} />;
}
