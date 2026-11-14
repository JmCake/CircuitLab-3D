import { useEffect, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import type { ComponentDefinition, LabComponent, PortDefinition } from '../circuit';
import { getDefinition, makePortId } from '../circuit';
import { useLabStore } from '../store/labStore';
import { useViewStore } from '../store/viewStore';
import { LabelPlane, useDrawTexture } from './graphics';
import { MATERIALS, SHARED_GEOMETRY } from './materials';
import { registerPortTarget, unregisterPortTarget } from './portRegistry';
import { useAnimationWake } from './useAnimationWake';

const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);
const DRAG_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

export function Screw({
  position,
  rotation = [0, 0, 0],
  scale = 1,
}: {
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
}) {
  return (
    <group position={position} rotation={rotation} scale={scale}>
      <mesh geometry={SHARED_GEOMETRY.screwHead} rotation={[Math.PI / 2, 0, 0]} material={MATERIALS.metalDark} />
      <mesh geometry={SHARED_GEOMETRY.screwSlot} position={[0, 0, 0.0017]} material={MATERIALS.panelInset} />
      <mesh
        geometry={SHARED_GEOMETRY.screwSlot}
        position={[0, 0, 0.0018]}
        rotation={[0, 0, Math.PI / 2]}
        material={MATERIALS.panelInset}
      />
    </group>
  );
}

export function RubberFoot({
  position,
  scale = 1,
}: {
  position: [number, number, number];
  scale?: number;
}) {
  return (
    <group position={position} scale={scale}>
      <mesh geometry={SHARED_GEOMETRY.footTop} position={[0, 0.001, 0]} material={MATERIALS.metalDark} />
      <mesh geometry={SHARED_GEOMETRY.foot} material={MATERIALS.rubber} />
    </group>
  );
}

interface InstrumentFrameProps {
  component: LabComponent;
  selected: boolean;
  children: React.ReactNode;
}

/**
 * 所有仪器的统一根节点：位置、绕 Y 轴的方向、整体拖动与选中框。
 * 子控件通过 stopPropagation 把输入优先级提高，避免旋转器材时误触旋钮。
 */
export function InstrumentFrame({ component, selected, children }: InstrumentFrameProps) {
  const group = useRef<THREE.Group>(null);
  const beginMove = useLabStore((state) => state.beginMove);

  useEffect(() => {
    if (!group.current) return;
    group.current.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        if (object.userData.skipShadow) return;
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
  }, [component.id, children]);

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const hit = new THREE.Vector3();
    if (event.ray.intersectPlane(DRAG_PLANE, hit)) {
      beginMove(component.id, [hit.x, hit.z]);
    } else {
      beginMove(component.id, component.position);
    }
  };

  const footprint = getDefinition(component.type).footprint;
  const halfW = footprint[0] / 2 + 0.008;
  const halfD = footprint[1] / 2 + 0.008;
  const outlineGeometry = useMemo(() => {
    const points = [
      new THREE.Vector3(-halfW, 0.0045, -halfD),
      new THREE.Vector3(halfW, 0.0045, -halfD),
      new THREE.Vector3(halfW, 0.0045, halfD),
      new THREE.Vector3(-halfW, 0.0045, halfD),
    ];
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [halfW, halfD]);
  useEffect(() => () => outlineGeometry.dispose(), [outlineGeometry]);

  return (
    <group
      ref={group}
      position={[component.position[0], 0, component.position[1]]}
      rotation={[0, component.rotationY, 0]}
      onPointerDown={handlePointerDown}
      onDoubleClick={event => { event.stopPropagation(); useViewStore.getState().openConsole(component.id); }}
      userData={{ componentId: component.id, interactive: 'component' }}
    >
      {children}
      {selected && (
        <group renderOrder={8}>
          <mesh
            position={[0, 0.0024, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            raycast={() => undefined}
          >
            <planeGeometry args={[halfW * 2 - 0.006, halfD * 2 - 0.006]} />
            <meshBasicMaterial
              color="#c79a5c"
              transparent
              opacity={0.055}
              toneMapped={false}
              depthWrite={false}
            />
          </mesh>
          <lineLoop geometry={outlineGeometry} raycast={() => undefined}>
            <lineBasicMaterial
              color="#c18f53"
              transparent
              opacity={0.72}
              depthWrite={false}
              toneMapped={false}
            />
          </lineLoop>
        </group>
      )}
    </group>
  );
}

function portColor(role: PortDefinition['role']): 'positive' | 'negative' | 'neutral' {
  if (role === 'positive' || role === 'anode') return 'positive';
  if (role === 'negative' || role === 'cathode') return 'negative';
  return 'neutral';
}

/**
 * 独立端口。视觉结构与电气锚点共用同一局部坐标：
 * 在器材局部 +Z 方向伸出绝缘底座、金属轴与彩色端帽。
 */
export function Port3D({
  component,
  port,
  compact = false,
}: {
  component: LabComponent;
  port: PortDefinition;
  compact?: boolean;
}) {
  const pickRef = useRef<THREE.Mesh>(null);
  const portId = makePortId(component.id, port.key);
  const beginWire = useLabStore((state) => state.beginWire);
  const isHovered = useLabStore((state) => state.hoveredPortId === portId);
  const isWireSource = useLabStore((state) => state.draftWire?.fromPortId === portId);
  const isWireTarget = useLabStore((state) => state.draftWire?.targetPortId === portId);
  const targetValid = useLabStore(
    (state) => state.draftWire?.targetPortId === portId && state.draftWire.valid,
  );
  const isWiring = useLabStore((state) => Boolean(state.draftWire));
  const connectionCount = useLabStore(
    (state) =>
      state.wires.reduce(
        (count, wire) =>
          count + Number(wire.fromPortId === portId) + Number(wire.toPortId === portId),
        0,
      ),
  );

  useEffect(() => {
    registerPortTarget(portId, pickRef.current);
    return () => unregisterPortTarget(portId, pickRef.current);
  }, [portId]);

  const quaternion = useMemo(() => {
    const normal = new THREE.Vector3(...(port.normal ?? [0, 0, 1])).normalize();
    return new THREE.Quaternion().setFromUnitVectors(FORWARD, normal);
  }, [port.normal]);

  const family = portColor(port.role);
  const insulatorMaterial =
    family === 'positive'
      ? MATERIALS.redPlastic
      : family === 'negative'
        ? MATERIALS.blackPlastic
        : MATERIALS.plasticDarkGray;

  const activeColor = isWireSource
    ? '#ffbd6b'
    : isWireTarget
      ? targetValid
        ? '#7af1c0'
        : '#ff7a68'
      : isHovered
        ? '#f1d4a3'
        : null;

  const scale = compact ? 0.76 : 1;
  const handlePortDown = (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    beginWire(portId);
  };

  return (
    <group
      position={port.position}
      quaternion={quaternion}
      scale={scale}
      onPointerDown={handlePortDown}
      userData={{ portGroupId: portId }}
    >
      {/* 绝缘底座与六角锁紧螺母 */}
      <mesh position={[0, 0, -0.021]} rotation={[Math.PI / 2, 0, 0]} material={insulatorMaterial}>
        <cylinderGeometry args={[0.0165, 0.019, 0.012, 28]} />
      </mesh>
      <mesh position={[0, 0, -0.012]} rotation={[Math.PI / 2, 0, 0]} material={MATERIALS.metalDark}>
        <cylinderGeometry args={[0.0185, 0.0185, 0.0055, 6]} />
      </mesh>
      <mesh position={[0, 0, -0.0035]} rotation={[Math.PI / 2, 0, 0]} material={MATERIALS.metal}>
        <cylinderGeometry args={[0.0075, 0.0082, 0.013, 20]} />
      </mesh>
      <mesh position={[0, 0, 0.007]} rotation={[Math.PI / 2, 0, 0]} material={insulatorMaterial}>
        <cylinderGeometry args={[0.0135, 0.0148, 0.017, 24]} />
      </mesh>
      <mesh position={[0, 0, 0.0173]} rotation={[Math.PI / 2, 0, 0]} material={insulatorMaterial}>
        <cylinderGeometry args={[0.0112, 0.0142, 0.0065, 18]} />
      </mesh>
      <mesh position={[0, 0, 0.0222]} rotation={[Math.PI / 2, 0, 0]} material={MATERIALS.goldContact}>
        <cylinderGeometry args={[0.0078, 0.0108, 0.0028, 20]} />
      </mesh>
      <mesh position={[0, 0, 0.0241]} rotation={[Math.PI / 2, 0, 0]} material={MATERIALS.blackPlastic}>
        <cylinderGeometry args={[0.0042, 0.0042, 0.0018, 16]} />
      </mesh>
      <mesh position={[0, 0, 0.0022]} rotation={[0, 0, 0]} material={MATERIALS.brass}>
        <torusGeometry args={[0.0172, 0.0015, 8, 26]} />
      </mesh>

      {activeColor && (
        <mesh position={[0, 0, 0.027]} renderOrder={10}>
          <torusGeometry args={[0.0215, 0.0023, 8, 28]} />
          <meshBasicMaterial color={activeColor} transparent opacity={0.95} toneMapped={false} depthWrite={false} />
        </mesh>
      )}
      {isWiring && !isWireSource && !isWireTarget && (
        <mesh position={[0, 0, 0.0255]} renderOrder={9}>
          <torusGeometry args={[0.0205, 0.0011, 6, 22]} />
          <meshBasicMaterial color="#7af1c0" transparent opacity={0.26} toneMapped={false} depthWrite={false} />
        </mesh>
      )}
      {connectionCount > 0 && (
        <mesh position={[0, 0.022, -0.005]} renderOrder={8}>
          <sphereGeometry args={[0.004 + connectionCount * 0.0006, 10, 8]} />
          <meshBasicMaterial color="#d8c393" toneMapped={false} />
        </mesh>
      )}

      {/* 透明命中体：独立于可见几何，提供容错半径但不会误连相邻端口 */}
      <mesh
        ref={pickRef}
        position={[0, 0, 0.004]}
        onPointerDown={handlePortDown}
        userData={{ skipShadow: true, portId }}
      >
        <sphereGeometry args={[0.034, 12, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
    </group>
  );
}

export function InstrumentFeet({
  width,
  depth,
  y = -0.004,
}: {
  width: number;
  depth: number;
  y?: number;
}) {
  const insetX = width / 2 - 0.026;
  const insetZ = depth / 2 - 0.026;
  return (
    <group>
      <RubberFoot position={[-insetX, y, -insetZ]} />
      <RubberFoot position={[insetX, y, -insetZ]} />
      <RubberFoot position={[-insetX, y, insetZ]} />
      <RubberFoot position={[insetX, y, insetZ]} />
    </group>
  );
}

export function ventSlots(params: {
  count?: number;
  slotWidth?: number;
  slotHeight?: number;
  gap?: number;
  position: [number, number, number];
  rotation?: [number, number, number];
  material?: THREE.Material;
}) {
  const {
    count = 8,
    slotWidth = 0.004,
    slotHeight = 0.07,
    gap = 0.011,
    position,
    rotation = [0, 0, 0],
    material = MATERIALS.panelInset,
  } = params;
  const total = count * slotWidth + (count - 1) * gap;
  return (
    <group position={position} rotation={rotation}>
      {Array.from({ length: count }, (_, index) => (
        <mesh
          key={index}
          position={[-total / 2 + slotWidth / 2 + index * (slotWidth + gap), 0, 0]}
          material={material}
        >
          <boxGeometry args={[slotWidth, slotHeight, 0.004]} />
        </mesh>
      ))}
    </group>
  );
}

interface KnurledKnobProps {
  position: [number, number, number];
  radius?: number;
  depth?: number;
  angle?: number;
  indicatorColor?: string;
  bodyMaterial?: THREE.Material;
  onBeginDrag?: (clientX: number, clientY: number) => void;
  onPress?: () => void;
  disabled?: boolean;
  label?: string;
}

export function KnurledKnob({
  position,
  radius = 0.027,
  depth = 0.021,
  angle = 0,
  indicatorColor = '#efe8d8',
  bodyMaterial = MATERIALS.knobGrip,
  onBeginDrag,
  onPress,
  disabled = false,
}: KnurledKnobProps) {
  const rotor = useRef<THREE.Group>(null);
  useAnimationWake(angle);

  useFrame((state, delta) => {
    if (!rotor.current) return;
    rotor.current.rotation.z = THREE.MathUtils.damp(rotor.current.rotation.z, angle, 14, delta);
    if (Math.abs(rotor.current.rotation.z - angle) > 0.0001) state.invalidate();
  });

  const handleDown = (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    if (disabled) return;
    if (onBeginDrag) {
      onBeginDrag(event.nativeEvent.clientX, event.nativeEvent.clientY);
    } else if (onPress) {
      onPress();
    }
  };

  return (
    <group position={position} onPointerDown={handleDown} userData={{ interactive: 'knob' }}>
      <mesh
        position={[0, 0, 0.0019]}
        rotation={[Math.PI / 2, 0, 0]}
        material={MATERIALS.metal}
        onPointerDown={handleDown}
      >
        <cylinderGeometry args={[radius * 1.22, radius * 1.28, 0.0045, 36]} />
      </mesh>
      <mesh position={[0, 0, 0.0044]} rotation={[0, 0, 0]} material={MATERIALS.brass} onPointerDown={handleDown}>
        <torusGeometry args={[radius * 1.17, 0.0009, 6, 36]} />
      </mesh>
      <mesh position={[0, 0, 0.0032]} rotation={[0, 0, 0]} material={MATERIALS.panelInset} onPointerDown={handleDown}>
        <torusGeometry args={[radius * 1.12, 0.0017, 6, 32]} />
      </mesh>
      <group ref={rotor} rotation={[0, 0, angle]}>
        <mesh
          position={[0, 0, 0.004 + depth / 2]}
          rotation={[Math.PI / 2, 0, 0]}
          material={bodyMaterial}
          onPointerDown={handleDown}
        >
          <cylinderGeometry args={[radius, radius * 1.04, depth, 18, 1]} />
        </mesh>
        <mesh
          position={[0, 0, 0.0055 + depth]}
          rotation={[Math.PI / 2, 0, 0]}
          material={MATERIALS.metalDark}
          onPointerDown={handleDown}
        >
          <cylinderGeometry args={[radius * 0.88, radius * 0.92, 0.0045, 28]} />
        </mesh>
        <mesh
          position={[0, 0, 0.0086 + depth]}
          rotation={[0, 0, 0]}
          material={MATERIALS.metalBright}
          onPointerDown={handleDown}
        >
          <cylinderGeometry args={[radius * 0.16, radius * 0.2, 0.0018, 20]} />
        </mesh>
        <mesh position={[0, radius * 0.57, 0.008 + depth]} material={MATERIALS.metalBright} onPointerDown={handleDown}>
          <boxGeometry args={[0.0034, radius * 0.76, 0.0026]} />
        </mesh>
        <mesh
          position={[0, radius * 0.92, 0.0084 + depth]}
          onPointerDown={handleDown}
        >
          <boxGeometry args={[0.0052, 0.008, 0.0026]} />
          <meshBasicMaterial color={indicatorColor} toneMapped={false} />
        </mesh>
      </group>
      <mesh
        position={[0, 0, 0.012 + depth]}
        rotation={[Math.PI / 2, 0, 0]}
        onPointerDown={handleDown}
        userData={{ skipShadow: true }}
      >
        <cylinderGeometry args={[radius * 1.35, radius * 1.35, 0.055, 18]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
    </group>
  );
}

interface DialScaleProps {
  position: [number, number, number];
  radius: number;
  startDeg?: number;
  endDeg?: number;
  ticks?: number;
  majorEvery?: number;
  labels?: { at: number; text: string }[];
  color?: string;
  label?: string;
}

export function DialScale({
  position,
  radius,
  startDeg = -140,
  endDeg = 140,
  ticks = 21,
  majorEvery = 5,
  labels = [],
  color = '#5b5a54',
  label,
}: DialScaleProps) {
  const size = radius * 2.5;
  const dimension = 512;
  const texture = useDrawTexture(
    dimension,
    dimension,
    (ctx) => {
      ctx.clearRect(0, 0, dimension, dimension);
      const cx = dimension / 2;
      const cy = dimension / 2;
      const outer = dimension * 0.42;
      for (let i = 0; i < ticks; i += 1) {
        const t = ticks === 1 ? 0 : i / (ticks - 1);
        const deg = startDeg + (endDeg - startDeg) * t;
        const radians = THREE.MathUtils.degToRad(deg);
        const major = i % majorEvery === 0;
        const inner = outer - (major ? 35 : 20);
        const outerRadius = outer;
        const x1 = cx + Math.sin(radians) * inner;
        const y1 = cy - Math.cos(radians) * inner;
        const x2 = cx + Math.sin(radians) * outerRadius;
        const y2 = cy - Math.cos(radians) * outerRadius;
        ctx.strokeStyle = major ? color : `${color}99`;
        ctx.lineWidth = major ? 5 : 2.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.strokeStyle = `${color}66`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, outer + 13, THREE.MathUtils.degToRad(startDeg - 90), THREE.MathUtils.degToRad(endDeg - 90));
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '600 34px "Arial Narrow", "Microsoft YaHei", sans-serif';
      for (const labelItem of labels) {
        const radians = THREE.MathUtils.degToRad(labelItem.at);
        const x = cx + Math.sin(radians) * (outer + 48);
        const y = cy - Math.cos(radians) * (outer + 48);
        ctx.fillText(labelItem.text, x, y);
      }
      if (label) {
        ctx.fillStyle = `${color}aa`;
        ctx.font = '500 27px "Microsoft YaHei", sans-serif';
        ctx.fillText(label, cx, cy + 52);
      }
    },
    [radius, startDeg, endDeg, ticks, majorEvery, labels, color, label, dimension],
  );

  return (
    <mesh position={position} renderOrder={3} userData={{ skipShadow: true }} raycast={() => undefined}>
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

interface RockerSwitchProps {
  position: [number, number, number];
  on: boolean;
  onToggle: () => void;
  width?: number;
  height?: number;
  label?: string;
}

export function RockerSwitch({
  position,
  on,
  onToggle,
  width = 0.026,
  height = 0.035,
}: RockerSwitchProps) {
  const rotor = useRef<THREE.Group>(null);
  const target = on ? -0.38 : 0.38;
  useAnimationWake(target);

  useFrame((state, delta) => {
    if (!rotor.current) return;
    rotor.current.rotation.x = THREE.MathUtils.damp(rotor.current.rotation.x, target, 18, delta);
    if (Math.abs(rotor.current.rotation.x - target) > 0.0001) state.invalidate();
  });

  const handleToggleDown = (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    onToggle();
  };

  return (
    <group position={position} onPointerDown={handleToggleDown} userData={{ interactive: 'rocker' }}>
      <mesh position={[0, 0, 0.002]} material={MATERIALS.panelInset}>
        <boxGeometry args={[width + 0.009, height + 0.009, 0.007]} />
      </mesh>
      <mesh position={[0, 0, 0.0056]} material={MATERIALS.metalDark}>
        <boxGeometry args={[width + 0.004, height + 0.004, 0.002]} />
      </mesh>
      <group ref={rotor} position={[0, 0, 0.007]} rotation={[target, 0, 0]}>
        <RoundedBox
          args={[width, height, 0.011]}
          radius={0.0025}
          smoothness={3}
          position={[0, 0, 0.004]}
          material={MATERIALS.plasticBlack}
        />
        <mesh position={[0, height * 0.23, 0.0102]} material={on ? MATERIALS.accentTeal : MATERIALS.metalDark}>
          <boxGeometry args={[width * 0.55, 0.0025, 0.0012]} />
        </mesh>
      </group>
      <mesh
        position={[0, 0, 0.02]}
        onPointerDown={handleToggleDown}
        userData={{ skipShadow: true }}
      >
        <boxGeometry args={[width + 0.018, height + 0.018, 0.03]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
    </group>
  );
}

export function PushButton({
  position,
  label,
  onClick,
  color = '#8c443c',
  size = 0.017,
}: {
  position: [number, number, number];
  label?: string;
  onClick: () => void;
  color?: string;
  size?: number;
}) {
  const handleDown = (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    onClick();
  };
  return (
    <group position={position} onPointerDown={handleDown} userData={{ interactive: 'button' }}>
      <mesh position={[0, 0, 0.0015]} rotation={[Math.PI / 2, 0, 0]} material={MATERIALS.metalDark}>
        <cylinderGeometry args={[size * 1.2, size * 1.2, 0.003, 24]} />
      </mesh>
      <mesh position={[0, 0, 0.006]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[size, size, 0.008, 24]} />
        <meshStandardMaterial color={color} roughness={0.48} metalness={0.05} />
      </mesh>
      <mesh
        position={[0, 0, 0.018]}
        rotation={[Math.PI / 2, 0, 0]}
        onPointerDown={handleDown}
        userData={{ skipShadow: true }}
      >
        <cylinderGeometry args={[size * 1.35, size * 1.35, 0.035, 18]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
      {label && (
        <LabelPlane
          text={label}
          width={0.045}
          height={0.014}
          position={[0, -size * 1.8, 0.008]}
          fontSize={36}
          color="#5f5c54"
        />
      )}
    </group>
  );
}

export function ventPanelMaterial(color = '#232628'): THREE.Material {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.4 });
}

export const PART_UP = UP;
