import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import type { PortDefinition } from '../../circuit';
import { getDefinition, makePortId, parsePortId } from '../../circuit';
import { useLabStore } from '../../store/labStore';
import { LabelPlane, useDrawTexture } from '../graphics';
import { MATERIALS } from '../materials';
import { registerPortTarget, unregisterPortTarget } from '../portRegistry';
import type { InstrumentModelProps } from './types';

const BOARD_PORTS = getDefinition('breadboard').ports;
const BOARD_WIDTH = 0.44;
const BOARD_DEPTH = 0.22;

function pathIncludesRail(port: PortDefinition): boolean {
  return port.key.startsWith('rail');
}

function useInstances(
  ref: React.RefObject<THREE.InstancedMesh | null>,
  ports: PortDefinition[],
  transform: (port: PortDefinition, matrix: THREE.Matrix4) => void,
) {
  useLayoutEffect(() => {
    if (!ref.current) return;
    const matrix = new THREE.Matrix4();
    ports.forEach((port, index) => {
      matrix.identity();
      transform(port, matrix);
      ref.current!.setMatrixAt(index, matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [ref, ports, transform]);
}

function HolePort({ componentId, port }: { componentId: string; port: PortDefinition }) {
  const pick = useRef<THREE.Mesh>(null);
  const beginWire = useLabStore((state) => state.beginWire);
  const portId = makePortId(componentId, port.key);
  useEffect(() => {
    registerPortTarget(portId, pick.current);
    return () => unregisterPortTarget(portId, pick.current);
  }, [portId]);
  return (
    <mesh
      ref={pick}
      position={[port.position[0], 0.034, port.position[2]]}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        beginWire(portId);
      }}
      userData={{ skipShadow: true, portId }}
    >
      <sphereGeometry args={[0.014, 8, 6]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
    </mesh>
  );
}

function TopMarkings() {
  const texture = useDrawTexture(
    1024,
    512,
    (ctx) => {
      const toX = (x: number) => ((x + BOARD_WIDTH / 2) / BOARD_WIDTH) * 1024;
      const toY = (z: number) => ((z + BOARD_DEPTH / 2) / BOARD_DEPTH) * 512;
      ctx.clearRect(0, 0, 1024, 512);
      ctx.strokeStyle = 'rgba(85, 92, 90, 0.3)';
      ctx.lineWidth = 2;

      // 电源轨彩线
      ctx.strokeStyle = '#a7453a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(toX(-0.197), toY(-0.098));
      ctx.lineTo(toX(0.197), toY(-0.098));
      ctx.stroke();
      ctx.strokeStyle = '#37647e';
      ctx.beginPath();
      ctx.moveTo(toX(-0.197), toY(0.098));
      ctx.lineTo(toX(0.197), toY(0.098));
      ctx.stroke();

      ctx.fillStyle = 'rgba(57, 66, 63, 0.9)';
      ctx.font = '700 28px "Arial Narrow", sans-serif';
      ctx.textAlign = 'center';
      for (let i = 0; i < 6; i += 1) {
        const x = -0.145 + i * 0.058;
        ctx.fillText(String(i + 1), toX(x), toY(-0.062));
      }
      ctx.textAlign = 'right';
      for (let r = 0; r < 5; r += 1) {
        ctx.fillText(String.fromCharCode(65 + r), toX(-0.171), toY(-0.028 + r * 0.022) + 9);
      }
      ctx.font = '700 23px "Arial Narrow", sans-serif';
      ctx.fillStyle = '#a7453a';
      ctx.textAlign = 'left';
      ctx.fillText('+', toX(-0.196), toY(-0.073));
      ctx.fillStyle = '#37647e';
      ctx.fillText('−', toX(-0.196), toY(0.078));

      ctx.fillStyle = 'rgba(74, 82, 78, 0.72)';
      ctx.font = '600 19px "Arial Narrow", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('CIRCUITLAB  ·  MINI BREADBOARD  ·  42 TIE POINTS', toX(-0.196), toY(-0.002));
      ctx.font = '500 17px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('每列 5 孔内部连通  ·  电源轨纵向连通', toX(0.196), toY(0.021));

      // 细小的中心分界标记
      ctx.setLineDash([7, 6]);
      ctx.strokeStyle = 'rgba(92, 99, 95, 0.3)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(toX(-0.186), toY(0.04));
      ctx.lineTo(toX(0.186), toY(0.04));
      ctx.stroke();
      ctx.setLineDash([]);
    },
    [],
  );
  return (
    <mesh
      position={[0, 0.03355, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      userData={{ skipShadow: true }}
      raycast={() => undefined}
    >
      <planeGeometry args={[BOARD_WIDTH, BOARD_DEPTH]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

export function Breadboard({ component }: InstrumentModelProps) {
  const bankPorts = useMemo(() => BOARD_PORTS.filter((port) => !pathIncludesRail(port)), []);
  const railPorts = useMemo(() => BOARD_PORTS.filter(pathIncludesRail), []);
  const holes = useRef<THREE.InstancedMesh>(null);
  const ferrules = useRef<THREE.InstancedMesh>(null);
  const railHoles = useRef<THREE.InstancedMesh>(null);
  const hoveredPortId = useLabStore((state) => state.hoveredPortId);
  const draftFrom = useLabStore((state) => state.draftWire?.fromPortId ?? null);
  const draftTarget = useLabStore((state) => state.draftWire?.targetPortId ?? null);
  const draftValid = useLabStore((state) => state.draftWire?.valid ?? false);
  const isWiring = useLabStore((state) => Boolean(state.draftWire));

  const portTranslation = useMemo(
    () => (port: PortDefinition, matrix: THREE.Matrix4) => {
      matrix.makeTranslation(port.position[0], 0.0334, port.position[2]);
    },
    [],
  );

  const ferruleTransform = useMemo(
    () => (port: PortDefinition, matrix: THREE.Matrix4) => {
      const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
      matrix.compose(
        new THREE.Vector3(port.position[0], 0.0342, port.position[2]),
        quaternion,
        new THREE.Vector3(1, 1, 1),
      );
    },
    [],
  );

  useInstances(holes, bankPorts, portTranslation);
  useInstances(railHoles, railPorts, portTranslation);
  useInstances(ferrules, BOARD_PORTS, ferruleTransform);

  const highlightPort = useMemo(() => {
    const candidateId = draftFrom ?? hoveredPortId ?? draftTarget;
    if (!candidateId) return null;
    const parsed = parsePortId(candidateId);
    if (!parsed || parsed.componentId !== component.id) return null;
    const port = BOARD_PORTS.find((item) => item.key === parsed.portKey);
    if (!port) return null;
    const isSource = candidateId === draftFrom;
    const isTarget = candidateId === draftTarget;
    const color = isSource ? '#ffb767' : isTarget ? (draftValid ? '#79f1bf' : '#ff7b68') : '#a8e7d2';
    return { port, color };
  }, [component.id, hoveredPortId, draftFrom, draftTarget, draftValid]);

  return (
    <group>
      {/* 白色阻燃 ABS 板体 */}
      <RoundedBox
        args={[BOARD_WIDTH, 0.024, BOARD_DEPTH]}
        radius={0.008}
        smoothness={4}
        position={[0, 0.021, 0]}
        material={MATERIALS.plasticIvory}
      />
      <RoundedBox
        args={[0.418, 0.012, 0.198]}
        radius={0.005}
        smoothness={3}
        position={[0, 0.007, 0]}
        material={MATERIALS.shellShadow}
      />
      {[
        [-0.19, -0.092],
        [0.19, -0.092],
        [-0.19, 0.092],
        [0.19, 0.092],
      ].map(([x, z]) => (
        <mesh key={`${x}-${z}`} position={[x, 0.005, z]} material={MATERIALS.rubber}>
          <cylinderGeometry args={[0.007, 0.008, 0.006, 12]} />
        </mesh>
      ))}

      <TopMarkings />

      {/* 孔位与金属簧片环 */}
      <instancedMesh ref={holes} args={[undefined, undefined, bankPorts.length]} frustumCulled={false}>
        <cylinderGeometry args={[0.0054, 0.0054, 0.0014, 14]} />
        <meshBasicMaterial color="#161b1b" toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={railHoles} args={[undefined, undefined, railPorts.length]} frustumCulled={false}>
        <cylinderGeometry args={[0.0054, 0.0054, 0.0014, 14]} />
        <meshBasicMaterial color="#161b1b" toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={ferrules} args={[undefined, undefined, BOARD_PORTS.length]} frustumCulled={false}>
        <torusGeometry args={[0.0067, 0.00075, 5, 14]} />
        <meshStandardMaterial color="#9e8d67" roughness={0.38} metalness={0.6} />
      </instancedMesh>

      {BOARD_PORTS.map((port) => (
        <HolePort key={port.key} componentId={component.id} port={port} />
      ))}

      {highlightPort && (
        <mesh
          position={[highlightPort.port.position[0], 0.035, highlightPort.port.position[2]]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={9}
        >
          <torusGeometry args={[0.012, 0.0017, 6, 20]} />
          <meshBasicMaterial color={highlightPort.color} transparent opacity={0.95} toneMapped={false} depthWrite={false} />
        </mesh>
      )}
      {isWiring && (
        <mesh
          position={[0, 0.0348, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={7}
        >
          <planeGeometry args={[BOARD_WIDTH + 0.015, BOARD_DEPTH + 0.015]} />
          <meshBasicMaterial color="#6be4be" transparent opacity={0.035} toneMapped={false} depthWrite={false} />
        </mesh>
      )}

      <LabelPlane
        text="BREADBOARD  ·  42"
        width={0.12}
        height={0.008}
        position={[0, 0.013, 0.108]}
        color="#777c76"
        fontSize={26}
      />
      <LabelPlane
        text="+"
        width={0.02}
        height={0.016}
        position={[-0.205, 0.041, -0.092]}
        color="#a7453a"
        fontSize={42}
      />
      <LabelPlane
        text="−"
        width={0.02}
        height={0.016}
        position={[-0.205, 0.041, 0.092]}
        color="#37647e"
        fontSize={42}
      />
    </group>
  );
}
