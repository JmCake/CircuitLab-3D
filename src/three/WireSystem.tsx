import { useEffect, useMemo } from 'react';
import { Line } from '@react-three/drei';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { type Wire as CircuitWire } from '../circuit';
import { useLabStore } from '../store/labStore';
import { MATERIALS } from './materials';
import { createWireRoutingScene, getWireAttachment, routeWire, routeWires, WIRE_RADIUS, type RoutedWire, type WireAttachment, type WireRoutingScene } from './wireRouting';
import { useViewStore } from '../store/viewStore';
import { wireInspection } from './wireInspection';

type Attachment = WireAttachment;
const LOCAL_FORWARD = new THREE.Vector3(0, 0, 1);
const UP = new THREE.Vector3(0, 1, 0);

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
  from,
  to,
  route,
  selected,
}: {
  wire: CircuitWire;
  from: WireAttachment;
  to: WireAttachment;
  route: RoutedWire;
  selected: boolean;
}) {
  const selectWire = useLabStore((state) => state.selectWire);

  const geometry = useMemo(() => {
    return new THREE.TubeGeometry(route.curve, route.segments, WIRE_RADIUS, 7, false);
  }, [route]);

  const pickGeometry = useMemo(() => {
    return new THREE.TubeGeometry(route.curve, route.segments, 0.011, 4, false);
  }, [route]);

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
      <mesh geometry={geometry} material={material} castShadow receiveShadow userData={{ wireId: wire.id, routingMode: route.mode }} />
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

function WirePreview({ routingScene }: { routingScene: WireRoutingScene }) {
  const draft = useLabStore((state) => state.draftWire);
  const components = useLabStore((state) => state.components);
  const wires = useLabStore(state => state.wires);
  const stackAt = (id: string) => wires.filter(w => w.fromPortId === id || w.toPortId === id).length;
  const start = draft ? getWireAttachment(components, draft.fromPortId, stackAt(draft.fromPortId)) : null;

  if (!draft || !start) return null;
  const target = draft.targetPortId
    ? getWireAttachment(components, draft.targetPortId, stackAt(draft.targetPortId))
    : null;
  const endPoint = target
    ? target.pathPoint.clone()
    : new THREE.Vector3(...draft.cursor).add(new THREE.Vector3(0, 0.01, 0));
  const endNormal = target ? target.normal : UP;
  const route = routeWire(routingScene, start, { pathPoint: endPoint, normal: endNormal });
  const points = route?.curve.getSpacedPoints(route.segments);
  const color = !route ? '#ff7f69' : draft.valid
    ? '#72efbe'
    : draft.targetPortId
      ? '#ff7f69'
      : '#e6b56e';
  return (
    <group renderOrder={20}>
      {points && <Line
        points={points}
        color={color}
        lineWidth={2.2}
        dashed={!draft.valid}
        dashScale={10}
        dashSize={0.012}
        gapSize={0.008}
        transparent
        opacity={0.92}
        depthTest
      />}
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
  const scene = useThree(s => s.scene);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    wireInspection.scene = scene;
    return () => { if (wireInspection.scene === scene) wireInspection.scene = null; };
  }, [scene]);
  const wires = useLabStore((state) => state.wires);
  const components = useLabStore((state) => state.components);
  const selectedWireId = useLabStore((state) => state.selectedWireId);
  // Electrical parameter edits replace components too; routing depends only on instrument poses.
  const layoutKey = JSON.stringify(components.map(c => [c.id, c.type, ...c.position, c.rotationY]));
  const routingScene = useMemo(() => createWireRoutingScene(components), [layoutKey]);
  const routed = useMemo(() => routeWires(components, wires, routingScene), [layoutKey, wires, routingScene]);
  const blocked = routed.filter(r => !r.route).length;
  useEffect(() => {
    useViewStore.setState({ blockedWires: blocked });
    return () => { useViewStore.setState({ blockedWires: 0 }); };
  }, [blocked]);
  return (
    <group>
      {routed.map(({ wire, from, to, route }) => from && to && route && (
        <WireMesh
          key={wire.id}
          wire={wire}
          from={from}
          to={to}
          route={route}
          selected={wire.id === selectedWireId}
        />
      ))}
      <WirePreview routingScene={routingScene} />
    </group>
  );
}
