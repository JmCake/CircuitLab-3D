import { useEffect, useMemo, useRef } from 'react';
import { Line } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import {
  findPortOwner,
  getDefinition,
  getPortWorldNormal,
  getPortWorldPosition,
  type LabComponent,
  type PortDefinition,
  type Wire as CircuitWire,
} from '../circuit';
import { useLabStore } from '../store/labStore';
import { MATERIALS } from './materials';

interface Attachment {
  pathPoint: THREE.Vector3;
  plugPoint: THREE.Vector3;
  normal: THREE.Vector3;
  isHole: boolean;
}

const LOCAL_FORWARD = new THREE.Vector3(0, 0, 1);
const UP = new THREE.Vector3(0, 1, 0);

function getAttachment(
  components: LabComponent[],
  portId: string,
  stackIndex = 0,
): Attachment | null {
  const owner = findPortOwner(components, portId);
  if (!owner) return null;
  const port = getDefinition(owner.component.type).ports.find(
    (item) => item.key === owner.portKey,
  );
  if (!port) return null;
  const world = getPortWorldPosition(owner.component, owner.portKey);
  if (!world) return null;
  const normal = new THREE.Vector3(...getPortWorldNormal(owner.component, owner.portKey)).normalize();
  const p = new THREE.Vector3(...world);
  const isHole = port.role === 'hole' || port.visible === false;
  const stackOffset = isHole ? 0 : stackIndex * 0.024;
  const pathOffset = (isHole ? 0.028 : 0.057) + stackOffset;
  const plugOffset = (isHole ? 0.001 : 0.012) + stackOffset;
  return {
    pathPoint: p.clone().add(normal.clone().multiplyScalar(pathOffset)),
    plugPoint: p.clone().add(normal.clone().multiplyScalar(plugOffset)),
    normal,
    isHole,
  };
}

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function makeCurve(
  start: THREE.Vector3,
  startNormal: THREE.Vector3,
  end: THREE.Vector3,
  endNormal: THREE.Vector3,
  seed: string,
): THREE.CatmullRomCurve3 {
  const distance = start.distanceTo(end);
  const hash = hashSeed(seed);
  const horizontal = new THREE.Vector3(end.x - start.x, 0, end.z - start.z);
  const horizontalLength = horizontal.length();
  const side = horizontalLength > 1e-5
    ? new THREE.Vector3(-horizontal.z, 0, horizontal.x).normalize()
    : new THREE.Vector3(1, 0, 0);
  const lateral = ((hash % 7) - 3) * 0.008;
  // Slack cables sag onto the desk instead of forming tall arches across instrument displays.
  const deskHeight = 0.009 + (hash % 5) * 0.002;
  const firstControl = start
    .clone()
    .add(startNormal.clone().multiplyScalar(Math.min(0.06, distance * 0.32)))
    .add(new THREE.Vector3(0, -0.008, 0));
  const lastControl = end
    .clone()
    .add(endNormal.clone().multiplyScalar(Math.min(0.06, distance * 0.32)))
    .add(new THREE.Vector3(0, -0.008, 0));
  const middle = start
    .clone()
    .add(end)
    .multiplyScalar(0.5)
    .add(side.multiplyScalar(lateral));
  middle.y = Math.min(middle.y, deskHeight);
  const points = [start, firstControl, middle, lastControl, end];
  for (const point of points) {
    point.y = Math.max(0.006, point.y);
  }
  return new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.5);
}

function BananaPlug({
  attachment,
  color,
  scale,
  onPointerDown,
}: {
  attachment: Attachment;
  color: string;
  scale: number;
  onPointerDown?: (event: ThreeEvent<PointerEvent>) => void;
}) {
  const quaternion = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(LOCAL_FORWARD, attachment.normal),
    [attachment.normal],
  );
  const bootMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.48,
        metalness: 0.03,
      }),
    [color],
  );
  useEffect(() => () => bootMaterial.dispose(), [bootMaterial]);
  return (
    <group
      position={attachment.plugPoint.toArray()}
      quaternion={quaternion}
      scale={scale}
      onPointerDown={onPointerDown}
    >
      <mesh position={[0, 0, 0.008]} rotation={[Math.PI / 2, 0, 0]} material={MATERIALS.goldContact}>
        <cylinderGeometry args={[0.0032, 0.0038, 0.014, 12]} />
      </mesh>
      <mesh position={[0, 0, 0.025]} rotation={[Math.PI / 2, 0, 0]} material={bootMaterial}>
        <cylinderGeometry args={[0.0061, 0.0068, 0.022, 16]} />
      </mesh>
      <mesh position={[0, 0, 0.037]} rotation={[Math.PI / 2, 0, 0]} material={bootMaterial}>
        <cylinderGeometry args={[0.0052, 0.006, 0.009, 16]} />
      </mesh>
      <mesh position={[0, 0, 0.041]} rotation={[0, 0, 0]} material={MATERIALS.metalDark}>
        <torusGeometry args={[0.005, 0.0008, 6, 18]} />
      </mesh>
    </group>
  );
}

function WireMesh({
  wire,
  components,
  selected,
}: {
  wire: CircuitWire;
  components: LabComponent[];
  selected: boolean;
}) {
  const selectWire = useLabStore((state) => state.selectWire);
  const wires = useLabStore(state => state.wires);
  const stackAt = (portId: string) => wires.filter(w => w.fromPortId === portId || w.toPortId === portId).findIndex(w => w.id === wire.id);
  const from = getAttachment(components, wire.fromPortId, stackAt(wire.fromPortId));
  const to = getAttachment(components, wire.toPortId, stackAt(wire.toPortId));

  const pathKey = from && to
    ? `${from.pathPoint.x.toFixed(5)},${from.pathPoint.y.toFixed(5)},${from.pathPoint.z.toFixed(5)}|${to.pathPoint.x.toFixed(5)},${to.pathPoint.y.toFixed(5)},${to.pathPoint.z.toFixed(5)}|${wire.id}`
    : '';

  const geometry = useMemo(() => {
    if (!from || !to) return null;
    const curve = makeCurve(from.pathPoint, from.normal, to.pathPoint, to.normal, wire.id);
    return new THREE.TubeGeometry(curve, 40, 0.0033, 7, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathKey]);

  const pickGeometry = useMemo(() => {
    if (!from || !to) return null;
    const curve = makeCurve(from.pathPoint, from.normal, to.pathPoint, to.normal, wire.id);
    return new THREE.TubeGeometry(curve, 24, 0.011, 4, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathKey]);

  useEffect(() => {
    return () => {
      geometry?.dispose();
      pickGeometry?.dispose();
    };
  }, [geometry, pickGeometry]);

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: wire.color,
        roughness: 0.48,
        metalness: 0.03,
        emissive: selected ? '#6b4624' : '#000000',
        emissiveIntensity: selected ? 0.42 : 0,
      }),
    [wire.color, selected],
  );
  useEffect(() => () => material.dispose(), [material]);

  const select = (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    selectWire(wire.id);
  };

  if (!geometry || !pickGeometry || !from || !to) return null;

  return (
    <group>
      <mesh geometry={geometry} material={material} castShadow receiveShadow />
      {selected && (
        <mesh geometry={geometry}>
          <meshBasicMaterial color="#e2b371" transparent opacity={0.22} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      <mesh
        geometry={pickGeometry}
        onPointerDown={select}
        userData={{ skipShadow: true, interactive: 'wire', wireId: wire.id }}
      >
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
      <BananaPlug
        attachment={from}
        color={wire.color}
        scale={from.isHole ? 0.64 : 1}
        onPointerDown={select}
      />
      <BananaPlug
        attachment={to}
        color={wire.color}
        scale={to.isHole ? 0.64 : 1}
        onPointerDown={select}
      />
    </group>
  );
}

function WirePreview() {
  const draft = useLabStore((state) => state.draftWire);
  const components = useLabStore((state) => state.components);
  const start = draft ? getAttachment(components, draft.fromPortId) : null;

  if (!draft || !start) return null;
  const target = draft.targetPortId
    ? getAttachment(components, draft.targetPortId)
    : null;
  const endPoint = target
    ? target.pathPoint.clone()
    : new THREE.Vector3(...draft.cursor).add(new THREE.Vector3(0, 0.01, 0));
  const endNormal = target ? target.normal : UP;
  const curve = makeCurve(start.pathPoint, start.normal, endPoint, endNormal, 'preview');
  const points = curve.getPoints(42);
  const color = draft.valid
    ? '#72efbe'
    : draft.targetPortId
      ? '#ff7f69'
      : '#e6b56e';
  return (
    <group renderOrder={20}>
      <Line
        points={points}
        color={color}
        lineWidth={2.2}
        dashed={!draft.valid}
        dashScale={10}
        dashSize={0.012}
        gapSize={0.008}
        transparent
        opacity={0.92}
        depthTest={false}
      />
      <mesh position={endPoint}>
        <sphereGeometry args={[0.008, 16, 12]} />
        <meshBasicMaterial color={color} transparent opacity={0.55} toneMapped={false} depthWrite={false} />
      </mesh>
      {draft.valid && target && (
        <mesh
          position={target.pathPoint.clone().add(target.normal.clone().multiplyScalar(-0.01))}
          quaternion={new THREE.Quaternion().setFromUnitVectors(LOCAL_FORWARD, target.normal)}
          renderOrder={22}
        >
          <torusGeometry args={[0.024, 0.0022, 8, 28]} />
          <meshBasicMaterial color={color} transparent opacity={0.9} toneMapped={false} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

export function WireSystem() {
  const wires = useLabStore((state) => state.wires);
  const components = useLabStore((state) => state.components);
  const selectedWireId = useLabStore((state) => state.selectedWireId);
  return (
    <group>
      {wires.map((wire) => (
        <WireMesh
          key={wire.id}
          wire={wire}
          components={components}
          selected={wire.id === selectedWireId}
        />
      ))}
      <WirePreview />
    </group>
  );
}
