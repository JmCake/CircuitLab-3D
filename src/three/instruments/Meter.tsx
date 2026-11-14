import { RoundedBox } from '@react-three/drei';
import type { ComponentType } from '../../circuit';
import { getDefinition } from '../../circuit';
import { useLabStore } from '../../store/labStore';
import { DigitalDisplay, LabelPlane } from '../graphics';
import { MATERIALS } from '../materials';
import { InstrumentFeet, Port3D, PushButton, Screw } from '../parts';
import type { InstrumentModelProps } from './types';

function formatRange(value: number, kind: 'ammeter' | 'voltmeter'): string {
  if (kind === 'ammeter') {
    if (value < 1) return `${(value * 1000).toFixed(0)} mA`;
    return `${value.toFixed(1)} A`;
  }
  return `${value.toFixed(0)} V`;
}

export function Meter({ component, element }: InstrumentModelProps) {
  const kind = component.type as 'ammeter' | 'voltmeter';
  const definition = getDefinition(kind as ComponentType);
  const setParam = useLabStore((state) => state.setParam);
  const solved = useLabStore((state) => state.result.solved);
  const rangeDefinition = definition.params.find((param) => param.key === 'range');
  const options =
    rangeDefinition && rangeDefinition.kind === 'select' ? rangeDefinition.options : [];
  const currentRange = Number(component.params.range ?? options[0]?.value ?? 20);
  const accent = kind === 'ammeter' ? '#c58a45' : '#6e9db5';
  const screenColor = kind === 'ammeter' ? '#ffc26b' : '#91eed8';
  const reading = solved && typeof element?.reading === 'number' && Number.isFinite(element.reading)
    ? element.reading
    : null;
  const warning = solved && Boolean(element?.overRange);
  const ac = component.params.mode === 'ac';

  const cycleRange = () => {
    if (options.length === 0) return;
    const index = options.findIndex((option) => Number(option.value) === currentRange);
    const next = options[(index + 1 + options.length) % options.length];
    setParam(component.id, 'range', next.value);
  };

  return (
    <group>
      {/* 圆角厚壁仪表壳体与侧面防滑护边 */}
      <RoundedBox
        args={[0.23, 0.145, 0.17]}
        radius={0.014}
        smoothness={5}
        position={[0, 0.099, 0]}
        material={MATERIALS.shellLight}
      />
      <RoundedBox
        args={[0.238, 0.028, 0.174]}
        radius={0.008}
        smoothness={3}
        position={[0, 0.032, 0]}
        material={MATERIALS.rubberSoft}
      />
      <InstrumentFeet width={0.23} depth={0.17} y={0.008} />
      {[-0.099, 0.099].map((x) => (
        <mesh key={x} position={[x, 0.1, 0]} material={MATERIALS.rubberSoft}>
          <boxGeometry args={[0.022, 0.098, 0.14]} />
        </mesh>
      ))}

      {/* 前面板 */}
      <RoundedBox
        args={[0.205, 0.112, 0.006]}
        radius={0.006}
        smoothness={3}
        position={[0, 0.11, 0.085]}
        material={MATERIALS.shellWarm}
      />
      <mesh position={[0, 0.038, 0.089]} material={MATERIALS.panelDark}>
        <boxGeometry args={[0.206, 0.009, 0.006]} />
      </mesh>
      <mesh position={[0, 0.039, 0.093]}>
        <boxGeometry args={[0.14, 0.0025, 0.002]} />
        <meshStandardMaterial color={accent} roughness={0.4} metalness={0.28} />
      </mesh>

      <LabelPlane
        text={`DIGITAL ${ac ? 'AC' : 'DC'} ${kind === 'ammeter' ? 'AMMETER' : 'VOLTMETER'}`}
        width={0.162}
        height={0.008}
        position={[0, 0.157, 0.0895]}
        color="#474844"
        fontSize={34}
        fontWeight={700}
        align="left"
      />
      <LabelPlane
        text="DM-830"
        width={0.045}
        height={0.008}
        position={[0.077, 0.157, 0.0895]}
        color="#827d74"
        fontSize={28}
        align="right"
      />

      {/* 显示窗 */}
      <RoundedBox
        args={[0.165, 0.056, 0.014]}
        radius={0.0045}
        smoothness={3}
        position={[0, 0.123, 0.087]}
        material={MATERIALS.panelDark}
      />
      <mesh position={[0, 0.123, 0.095]} material={MATERIALS.panelInset}>
        <boxGeometry args={[0.153, 0.046, 0.0015]} />
      </mesh>
      <DigitalDisplay
        value={reading}
        unit={kind === 'ammeter' ? 'A' : 'V'}
        label={`${ac ? 'AC RMS' : 'DC'} · ${formatRange(currentRange, kind)}`}
        width={0.149}
        height={0.044}
        position={[0, 0.122, 0.096]}
        color={screenColor}
        warning={warning}
      />

      {/* 量程选择按钮 */}
      <PushButton position={[-0.087, 0.074, 0.09]} label={ac ? 'AC' : 'DC'} size={0.0105} color="#4e5b5d"
        onClick={() => setParam(component.id, 'mode', ac ? 'dc' : 'ac')} />
      <PushButton
        position={[0.087, 0.074, 0.09]}
        label="RANGE"
        onClick={cycleRange}
        color="#4e5b5d"
        size={0.0105}
      />
      <LabelPlane
        text="RANGE"
        width={0.041}
        height={0.007}
        position={[0.087, 0.058, 0.091]}
        color="#716b62"
        fontSize={28}
      />

      <LabelPlane
        text={kind === 'ammeter' ? 'A' : 'V'}
        width={0.032}
        height={0.02}
        position={[-0.082, 0.068, 0.091]}
        color="#716b62"
        fontSize={54}
        fontWeight={700}
      />
      <LabelPlane
        text="COM"
        width={0.041}
        height={0.007}
        position={[-0.082, 0.052, 0.091]}
        color="#716b62"
        fontSize={27}
      />
      <LabelPlane
        text={kind === 'ammeter' ? '10A MAX' : '1000V MAX'}
        width={0.055}
        height={0.007}
        position={[0.0, 0.045, 0.091]}
        color="#8b857a"
        fontSize={25}
      />

      {getDefinition(kind).ports.map((port) => (
        <Port3D key={port.key} component={component} port={port} compact />
      ))}
      <Screw position={[-0.094, 0.151, 0.089]} scale={0.8} />
      <Screw position={[0.094, 0.151, 0.089]} scale={0.8} />
      <Screw position={[-0.094, 0.061, 0.089]} scale={0.8} />
      <Screw position={[0.094, 0.061, 0.089]} scale={0.8} />

      {/* 侧面通风与背部支架 */}
      {[-1, 1].map((sign) => (
        <group key={sign}>
          <mesh position={[sign * 0.116, 0.105, 0]} material={MATERIALS.panelInset}>
            <boxGeometry args={[0.002, 0.06, 0.08]} />
          </mesh>
          {Array.from({ length: 5 }, (_, index) => (
            <mesh
              key={index}
              position={[sign * 0.1175, 0.105, -0.032 + index * 0.016]}
              material={MATERIALS.shellShadow}
            >
              <boxGeometry args={[0.0018, 0.05, 0.004]} />
            </mesh>
          ))}
        </group>
      ))}
      <mesh position={[0, 0.08, -0.087]} material={MATERIALS.shellShadow}>
        <boxGeometry args={[0.17, 0.052, 0.005]} />
      </mesh>
      <mesh position={[0, 0.076, -0.094]} material={MATERIALS.metalDark}>
        <boxGeometry args={[0.126, 0.008, 0.012]} />
      </mesh>
    </group>
  );
}
