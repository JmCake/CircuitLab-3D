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

function Filament({
  materialRef,
}: {
  materialRef: React.RefObject<THREE.MeshStandardMaterial | null>;
}) {
  const geometry = useMemo(() => {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 18; i += 1) {
      const t = i / 18;
      const x = (t - 0.5) * 0.032;
      const y = 0.162 + Math.sin(t * Math.PI * 4) * 0.009 + t * 0.008;
      const z = 0.012;
      points.push(new THREE.Vector3(x, y, z));
    }
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    return new THREE.TubeGeometry(curve, 90, 0.00075, 5, false);
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        ref={materialRef}
        color="#6f4d25"
        roughness={0.3}
        metalness={0.45}
        emissive="#ffb04b"
        emissiveIntensity={0.08}
      />
    </mesh>
  );
}

export function Bulb({ component, element }: InstrumentModelProps) {
  const resistance = Number(component.params.resistance ?? 120);
  const ratedPower = Number(component.params.ratedPower ?? 0.3);
  const ratedVoltage = Math.sqrt(Math.max(0.01, resistance * ratedPower));
  const filamentMaterial = useRef<THREE.MeshStandardMaterial>(null);
  const glassMaterial = useRef<THREE.MeshPhysicalMaterial>(null);
  const glowMaterial = useRef<THREE.SpriteMaterial>(null);
  const light = useRef<THREE.PointLight>(null);
  const glowSprite = useRef<THREE.Sprite>(null);
  const glowTexture = useMemo(() => getGlowTexture(), []);
  const smooth = useRef(0);
  const target = Math.min(1.4, Math.max(0, element?.brightness ?? 0));
  useAnimationWake(target);

  useFrame((state, delta) => {
    smooth.current = THREE.MathUtils.damp(smooth.current, target, 7, delta);
    if (Math.abs(smooth.current - target) > 0.0001) state.invalidate();
    const level = smooth.current;
    if (filamentMaterial.current) {
      filamentMaterial.current.emissiveIntensity = 0.08 + level * 8;
      filamentMaterial.current.color.setRGB(0.32 + level * 0.65, 0.15 + level * 0.48, 0.06 + level * 0.18);
    }
    if (glassMaterial.current) {
      glassMaterial.current.emissiveIntensity = level * 1.8;
      glassMaterial.current.opacity = 0.2 + level * 0.1;
    }
    if (glowMaterial.current) glowMaterial.current.opacity = level * 0.64;
    if (glowSprite.current) {
      const size = 0.2 + level * 0.15;
      glowSprite.current.scale.set(size, size, 1);
    }
    if (light.current) light.current.intensity = level * 0.9;
  });

  return (
    <group>
      {/* 灯座与木质/电木底板 */}
      <RoundedBox
        args={[0.196, 0.032, 0.152]}
        radius={0.009}
        smoothness={4}
        position={[0, 0.02, 0]}
        material={MATERIALS.darkCeramic}
      />
      <mesh position={[0, 0.037, 0]} material={MATERIALS.panelDark}>
        <boxGeometry args={[0.18, 0.004, 0.138]} />
      </mesh>
      <InstrumentFeet width={0.18} depth={0.13} y={0.005} />
      <Screw position={[-0.082, 0.038, 0.064]} scale={0.58} />
      <Screw position={[0.082, 0.038, 0.064]} scale={0.58} />

      {/* 陶瓷灯座与螺纹金属套 */}
      <mesh position={[0, 0.071, -0.007]} material={MATERIALS.ceramic}>
        <cylinderGeometry args={[0.037, 0.043, 0.064, 28]} />
      </mesh>
      <mesh position={[0, 0.104, -0.007]} material={MATERIALS.brass}>
        <cylinderGeometry args={[0.028, 0.032, 0.022, 24]} />
      </mesh>
      {[0.097, 0.104, 0.111].map((y) => (
        <mesh key={y} position={[0, y, -0.007]} rotation={[Math.PI / 2, 0, 0]} material={MATERIALS.goldContact}>
          <torusGeometry args={[0.029, 0.0014, 6, 28]} />
        </mesh>
      ))}
      <mesh position={[0, 0.12, -0.007]} material={MATERIALS.metalDark}>
        <cylinderGeometry args={[0.024, 0.028, 0.012, 24]} />
      </mesh>

      {/* 玻璃灯泡外壳 */}
      <mesh position={[0, 0.123, -0.007]}>
        <cylinderGeometry args={[0.024, 0.026, 0.03, 24]} />
        <meshPhysicalMaterial
          ref={glassMaterial}
          color="#ead3a1"
          roughness={0.06}
          metalness={0}
          transparent
          opacity={0.22}
          transmission={0.5}
          thickness={0.01}
          ior={1.45}
          clearcoat={1}
          clearcoatRoughness={0.04}
          emissive="#ffbe68"
          emissiveIntensity={0}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[0, 0.19, -0.007]}>
        <sphereGeometry args={[0.061, 36, 24]} />
        <meshPhysicalMaterial
          color="#ffe3b0"
          roughness={0.04}
          metalness={0}
          transparent
          opacity={0.2}
          transmission={0.48}
          thickness={0.008}
          ior={1.45}
          clearcoat={1}
          clearcoatRoughness={0.03}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 灯丝与引线 */}
      <mesh position={[-0.013, 0.12, -0.007]} material={MATERIALS.metalDark}>
        <cylinderGeometry args={[0.0011, 0.0011, 0.062, 6]} />
      </mesh>
      <mesh position={[0.013, 0.12, -0.007]} material={MATERIALS.metalDark}>
        <cylinderGeometry args={[0.0011, 0.0011, 0.062, 6]} />
      </mesh>
      <Filament materialRef={filamentMaterial} />
      <sprite
        ref={glowSprite}
        position={[0, 0.19, 0.025]}
        scale={[0.2, 0.2, 1]}
        raycast={() => undefined}
        renderOrder={12}
      >
        <spriteMaterial
          ref={glowMaterial}
          map={glowTexture}
          color="#ffbd70"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
      <pointLight ref={light} position={[0, 0.2, 0.08]} color="#ffbd70" intensity={0} distance={0.7} decay={2} />

      <LabelPlane
        text="INCANDESCENT  ·  WARM WHITE"
        width={0.14}
        height={0.008}
        position={[-0.006, 0.038, 0.078]}
        color="#d3c3a1"
        fontSize={27}
      />
      <LabelPlane
        text={`${ratedVoltage.toFixed(1)} V  /  ${ratedPower.toFixed(2)} W`}
        width={0.073}
        height={0.007}
        position={[-0.037, 0.028, 0.078]}
        color="#a99a82"
        fontSize={24}
        align="left"
      />
      <LabelPlane text="A" width={0.012} height={0.008} position={[-0.055, 0.063, 0.08]} color="#a99a82" fontSize={27} />
      <LabelPlane text="B" width={0.012} height={0.008} position={[0.055, 0.063, 0.08]} color="#a99a82" fontSize={27} />

      {getDefinition('bulb').ports.map((port) => (
        <Port3D key={port.key} component={component} port={port} compact />
      ))}
    </group>
  );
}
