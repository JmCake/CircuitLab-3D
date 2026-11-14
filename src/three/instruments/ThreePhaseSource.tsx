import { RoundedBox } from '@react-three/drei';
import { getDefinition } from '../../circuit';
import { useLabStore } from '../../store/labStore';
import { DigitalDisplay, LabelPlane } from '../graphics';
import { MATERIALS } from '../materials';
import { InstrumentFeet, KnurledKnob, Port3D, PushButton, Screw, ventSlots } from '../parts';
import type { InstrumentModelProps } from './types';

export function ThreePhaseSource({ component, element }: InstrumentModelProps) {
  const solved = useLabStore(s => s.result.solved);
  const beginControl = useLabStore(s => s.beginControl);
  const setParam = useLabStore(s => s.setParam);
  const enabled = Boolean(component.params.enabled);
  const voltage = Number(component.params.phaseVoltage ?? 24);
  const ports = getDefinition(component.type).ports;
  return <group>
    <RoundedBox args={[0.44, 0.212, 0.302]} radius={0.012} smoothness={5} position={[0, 0.13, 0]} material={MATERIALS.shellLight} />
    <RoundedBox args={[0.444, 0.02, 0.306]} radius={0.006} smoothness={3} position={[0, 0.027, 0]} material={MATERIALS.shellShadow} />
    <InstrumentFeet width={0.44} depth={0.30} y={0.008} />
    <RoundedBox args={[0.414, 0.187, 0.006]} radius={0.007} smoothness={3} position={[0, 0.132, 0.153]} material={MATERIALS.shellWarm} />
    <LabelPlane text="THREE-PHASE AC SOURCE" width={0.32} height={0.011} position={[0, 0.214, 0.157]} fontSize={48} color="#43586f" fontWeight={700} />
    {[-0.082, 0.096].map((x, index) => <group key={x}>
      <RoundedBox args={[0.152, 0.054, 0.012]} radius={0.004} position={[x, 0.174, 0.156]} material={MATERIALS.panelDark} />
      <DigitalDisplay value={enabled && solved ? index === 0 ? element?.voltage ?? null : element?.current ?? null : null}
        unit={index === 0 ? 'V' : 'A'} label={index === 0 ? 'U AN · RMS' : 'I A · RMS'} width={0.139} height={0.043}
        position={[x, 0.174, 0.164]} color={index === 0 ? '#91eed8' : '#ffc26b'} />
    </group>)}
    <KnurledKnob position={[-0.166, 0.114, 0.16]} radius={0.020} depth={0.018} angle={-2.35 + voltage / 230 * 4.7}
      onBeginDrag={(x, y) => beginControl(component.id, 'phaseVoltage', { x, y }, 'x')} />
    <LabelPlane text="V RMS" width={0.05} height={0.007} position={[-0.166, 0.088, 0.158]} fontSize={36} color="#616965" />
    <PushButton position={[0.177, 0.116, 0.159]} label={enabled ? 'ON' : 'OFF'} size={0.012}
      color={enabled ? '#437a61' : '#676b69'} onClick={() => setParam(component.id, 'enabled', !enabled)} />
    <LabelPlane text={`${Number(component.params.frequencyHz)} Hz  ·  ${String(component.params.sequence)}`} width={0.20} height={0.009}
      position={[0.01, 0.122, 0.158]} fontSize={42} color="#596773" />
    <mesh position={[0, 0.09, 0.157]} material={MATERIALS.shellShadow}><boxGeometry args={[0.38, 0.0012, 0.001]} /></mesh>
    {ports.map((port, i) => <group key={port.key}>
      <Port3D component={component} port={port} />
      <LabelPlane text={port.key.toUpperCase()} width={0.035} height={0.011} position={[port.position[0], 0.086, 0.158]}
        fontSize={50} color={['#aa852c', '#40705a', '#aa4d42', '#466b93'][i]} fontWeight={700} />
    </group>)}
    {[-0.195, 0.195].flatMap(x => [0.044, 0.217].map(y => <Screw key={`${x}-${y}`} position={[x, y, 0.158]} />))}
    {[-1, 1].map(side => <group key={side}>
      {ventSlots({ count: 7, slotWidth: 0.004, slotHeight: 0.068, gap: 0.011, position: [side * 0.2205, 0.15, -0.02], rotation: [0, side * Math.PI / 2, 0] })}
    </group>)}
    <mesh position={[0, 0.13, -0.153]} material={MATERIALS.panelDark}><boxGeometry args={[0.35, 0.11, 0.006]} /></mesh>
    <LabelPlane text="3-PHASE  ·  0–230 V RMS / PHASE\n50 / 60 Hz  ·  2 A MODEL LIMIT" width={0.25} height={0.025}
      position={[0, 0.15, -0.157]} rotation={[0, Math.PI, 0]} color="#d4d1c9" fontSize={36} />
    <mesh position={[0, 0.255, -0.105]} material={MATERIALS.metalDark}><boxGeometry args={[0.23, 0.011, 0.02]} /></mesh>
    {[-0.1, 0.1].map(x => <mesh key={x} position={[x, 0.244, -0.105]} material={MATERIALS.metal}><boxGeometry args={[0.014, 0.025, 0.02]} /></mesh>)}
  </group>;
}
