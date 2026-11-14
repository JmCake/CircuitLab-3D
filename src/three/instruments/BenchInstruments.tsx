import { RoundedBox } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { getDefinition, type LabComponent } from '../../circuit';
import { useLabStore } from '../../store/labStore';
import { DigitalDisplay, LabelPlane, useDrawTexture } from '../graphics';
import { MATERIALS } from '../materials';
import { InstrumentFeet, KnurledKnob, Port3D, PushButton, Screw, ventSlots } from '../parts';
import { useScopeFrame } from '../../ui/ScopeView';
import type { InstrumentModelProps } from './types';

function Case({ component, children }: { component: LabComponent; children: React.ReactNode }) {
  const d = getDefinition(component.type), [w, depth] = d.footprint, h = d.height - 0.025;
  return <group>
    <RoundedBox args={[w - 0.025, h, depth - 0.03]} radius={0.014} smoothness={5} position={[0, h / 2 + 0.015, 0]} material={MATERIALS.shellLight} />
    <RoundedBox args={[w - 0.017, 0.024, depth - 0.022]} radius={0.006} smoothness={3} position={[0, 0.024, 0]} material={MATERIALS.shellShadow} />
    <RoundedBox args={[w - 0.045, h - 0.018, 0.008]} radius={0.008} smoothness={4} position={[0, h / 2 + 0.017, depth / 2 - 0.011]} material={MATERIALS.shellWarm} />
    <InstrumentFeet width={w - 0.025} depth={depth - 0.03} y={0.007} />
    {[-1, 1].map(side => <group key={side}>{ventSlots({ count: 7, slotWidth: 0.004, slotHeight: h * 0.35, gap: 0.01, position: [side * (w / 2 - 0.012), h * 0.6, -0.025], rotation: [0, side * Math.PI / 2, 0] })}</group>)}
    {[-1, 1].flatMap(s => [0.042, h - 0.005].map(y => <Screw key={`${s}-${y}`} position={[s * (w / 2 - 0.035), y, depth / 2 - 0.005]} />))}
    <mesh position={[0, d.height + 0.003, -depth * 0.34]} material={MATERIALS.knobGrip}><boxGeometry args={[w * 0.56, 0.012, 0.018]} /></mesh>
    {[-1, 1].map(s => <mesh key={s} position={[s * w * 0.26, d.height - 0.01, -depth * 0.34]} material={MATERIALS.metalDark}><boxGeometry args={[0.013, 0.03, 0.02]} /></mesh>)}
    <mesh position={[0, h / 2 + 0.018, -depth / 2 + 0.012]} material={MATERIALS.metalDark}><boxGeometry args={[w * 0.77, h * 0.65, 0.006]} /></mesh>
    {children}
    {d.ports.map(p => <Port3D key={p.key} component={component} port={p} />)}
  </group>;
}
export function ProgrammableSupply({ component, element }: InstrumentModelProps) {
  const set = useLabStore(s => s.setParam), begin = useLabStore(s => s.beginControl), solved = useLabStore(s => s.result.solved);
  return <Case component={component}>
    <LabelPlane text="PROGRAMMABLE DC POWER SUPPLY" width={0.39} height={0.012} position={[-0.04, 0.209, 0.177]} color="#436759" fontSize={46} fontWeight={700} />
    <RoundedBox args={[0.36, 0.123, 0.011]} radius={0.007} position={[-0.065, 0.139, 0.173]} material={MATERIALS.panelDark} />
    {[1, 2].map(ch => { const on = Boolean(component.params.enabled && component.params[`output${ch}`]), x = ch === 1 ? -0.153 : 0.023; return <group key={ch}>
      <DigitalDisplay value={on && solved ? ch === 1 ? element?.voltage ?? null : Number(element?.flags?.voltage2 ?? 0) : null} unit="V" label={`CH${ch} · ${String(element?.flags?.[`mode${ch}`] ?? 'OFF')}`} width={0.164} height={0.061} position={[x, 0.16, 0.183]} off={!on} />
      <DigitalDisplay value={on && solved ? ch === 1 ? element?.current ?? null : Number(element?.flags?.current2 ?? 0) : null} unit="A" width={0.164} height={0.042} position={[x, 0.107, 0.183]} off={!on} color="#eac074" />
      <PushButton position={[ch === 1 ? -0.217 : -0.04, 0.061, 0.18]} label={on ? 'ON' : 'OFF'} color={on ? '#487e64' : '#777a73'} size={0.011} onClick={() => set(component.id, `output${ch}`, !component.params[`output${ch}`])} />
    </group>; })}
    {['voltage', 'currentLimit', 'voltage2', 'currentLimit2'].map((key, i) => <KnurledKnob key={key} position={[-0.18 + i * 0.079, 0.043, 0.18]} radius={0.017} depth={0.016} angle={Number(component.params[key]) / (key.startsWith('voltage') ? 30 : 3) * 4.7 - 2.35} onBeginDrag={(x, y) => begin(component.id, key, { x, y }, 'x')} />)}
    <PushButton position={[0.225, 0.193, 0.177]} label="POWER" size={0.009} color={component.params.enabled ? '#487e64' : '#777a73'} onClick={() => set(component.id, 'enabled', !component.params.enabled)} />
    {getDefinition(component.type).ports.map(p => <LabelPlane key={p.key} text={p.label} width={0.06} height={0.008} position={[p.position[0], p.position[1] + 0.024, 0.18]} fontSize={36} color="#615d50" />)}
  </Case>;
}
export function Multimeter({ component, element }: InstrumentModelProps) {
  const set = useLabStore(s => s.setParam), solved = useLabStore(s => s.result.solved);
  const modes = ['dcv', 'acv', 'dci', 'aci', 'ohms'], index = Math.max(0, modes.indexOf(String(component.params.mode)));
  return <Case component={component}>
    <LabelPlane text="BENCH MULTIMETER" width={0.27} height={0.011} position={[0, 0.164, 0.128]} color="#687461" fontSize={45} fontWeight={700} />
    <RoundedBox args={[0.312, 0.078, 0.012]} radius={0.006} position={[0, 0.112, 0.127]} material={MATERIALS.panelDark} />
    <DigitalDisplay value={solved && !element?.flags?.invalidReading ? element?.reading ?? null : null} unit={element?.readingUnit ?? 'V'} label={String(component.params.mode).toUpperCase()} width={0.298} height={0.065} position={[0, 0.112, 0.136]} color="#edc36b" off={!component.params.enabled} warning={element?.overRange} />
    <KnurledKnob position={[-0.114, 0.046, 0.13]} radius={0.028} depth={0.018} angle={-2.35 + index * 1.05} indicatorColor="#ead18d" onPress={() => set(component.id, 'mode', modes[(index + 1) % modes.length])} />
    <PushButton position={[0.15, 0.164, 0.128]} label="POWER" size={0.008} color={component.params.enabled ? '#a17c36' : '#75776e'} onClick={() => set(component.id, 'enabled', !component.params.enabled)} />
    {getDefinition(component.type).ports.map(p => <LabelPlane key={p.key} text={p.label} width={0.045} height={0.008} position={[p.position[0], 0.076, 0.133]} fontSize={40} color="#746a50" />)}
  </Case>;
}
export function Oscilloscope({ component }: InstrumentModelProps) {
  const frame = useScopeFrame(component), invalidate = useThree(s => s.invalidate), set = useLabStore(s => s.setParam);
  const texture = useDrawTexture(800, 510, ctx => {
    ctx.fillStyle = '#061512'; ctx.fillRect(0, 0, 800, 510); ctx.strokeStyle = '#1e3932'; ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) { ctx.beginPath(); ctx.moveTo(35 + i * 73, 40); ctx.lineTo(35 + i * 73, 450); ctx.stroke(); }
    for (let i = 0; i <= 8; i++) { ctx.beginPath(); ctx.moveTo(35, 40 + i * 51.25); ctx.lineTo(765, 40 + i * 51.25); ctx.stroke(); }
    ctx.save(); ctx.beginPath(); ctx.rect(35, 40, 730, 410); ctx.clip();
    for (const [i, t] of frame.traces.entries()) { ctx.strokeStyle = i ? '#77d6dc' : '#efc471'; ctx.lineWidth = 2.5; ctx.beginPath(); t.points.forEach((p, j) => { const x = 35 + p.time / frame.duration * 730, y = 245 - p.voltage / Number(component.params[`voltsDiv${i + 1}`]) * 51.25; if (!j) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); ctx.stroke(); } ctx.restore();
    ctx.fillStyle = '#80a79b'; ctx.font = '22px monospace'; ctx.fillText(`${Number(component.params.timeDiv) * 1000} ms/div`, 530, 28); ctx.fillText(component.params.running ? 'RUN' : 'HOLD', 35, 490);
    if (!frame.traces.some(t => t.connected)) { ctx.textAlign = 'center'; ctx.font = '26px sans-serif'; ctx.fillText('CH1 / CH2 未接入', 400, 245); }
  }, [frame, component.params]);
  useEffect(() => invalidate(), [texture, frame, invalidate]);
  return <Case component={component}>
    <LabelPlane text="DIGITAL STORAGE OSCILLOSCOPE" width={0.38} height={0.011} position={[0, 0.322, 0.155]} color="#68786d" fontSize={45} fontWeight={700} />
    <RoundedBox args={[0.345, 0.233, 0.016]} radius={0.008} position={[-0.06, 0.19, 0.154]} material={MATERIALS.panelDark} />
    <mesh position={[-0.06, 0.19, 0.164]}><planeGeometry args={[0.328, 0.215]} /><meshBasicMaterial map={texture} toneMapped={false} /></mesh>
    {[0, 1].map(i => <group key={i}>{[0, 1].map(j => { const key = i ? j ? 'triggerLevel' : 'timeDiv' : `voltsDiv${j + 1}`; return <KnurledKnob key={j} position={[0.155 + j * 0.065, 0.26 - i * 0.12, 0.157]} radius={0.019} depth={0.017} angle={0.25 + i * 0.6} onPress={() => { const d = getDefinition(component.type).params.find(p => p.key === key); if (d?.kind === 'select') { const k = d.options.findIndex(o => o.value === component.params[key]); set(component.id, key, d.options[(k + 1) % d.options.length].value); } }} onBeginDrag={key === 'triggerLevel' ? (x, y) => useLabStore.getState().beginControl(component.id, key, { x, y }, 'x') : undefined} />; })}</group>)}
    <PushButton position={[0.217, 0.313, 0.155]} label={component.params.running ? 'RUN' : 'HOLD'} size={0.009} color="#4a806b" onClick={() => set(component.id, 'running', !component.params.running)} />
    {getDefinition(component.type).ports.map(p => <LabelPlane key={p.key} text={p.key === 'negative' ? 'COM' : p.key.toUpperCase()} width={0.06} height={0.009} position={[p.position[0], 0.085, 0.162]} fontSize={40} color={p.key === 'ch1' ? '#a78541' : p.key === 'ch2' ? '#528b92' : '#626b64'} />)}
  </Case>;
}
