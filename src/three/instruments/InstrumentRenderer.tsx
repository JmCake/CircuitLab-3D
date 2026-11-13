import type { LabComponent } from '../../circuit';
import { useLabStore } from '../../store/labStore';
import { InstrumentFrame } from '../parts';
import { Breadboard } from './Breadboard';
import { Bulb } from './Bulb';
import { Capacitor } from './Capacitor';
import { LED } from './LED';
import { Meter } from './Meter';
import { PowerSupply } from './PowerSupply';
import { Resistor } from './Resistor';
import { ResistorBox } from './ResistorBox';
import { Rheostat } from './Rheostat';
import { Switch } from './Switch';

export function InstrumentRenderer({
  component,
  selected,
}: {
  component: LabComponent;
  selected: boolean;
}) {
  const element = useLabStore((state) => state.result.elements[component.id]);
  const commonProps = { component, selected, element };

  const model = (() => {
    switch (component.type) {
      case 'power-supply':
        return <PowerSupply {...commonProps} />;
      case 'ammeter':
      case 'voltmeter':
        return <Meter {...commonProps} />;
      case 'resistor':
        return <Resistor {...commonProps} />;
      case 'switch':
        return <Switch {...commonProps} />;
      case 'resistor-box':
        return <ResistorBox {...commonProps} />;
      case 'rheostat':
        return <Rheostat {...commonProps} />;
      case 'capacitor':
        return <Capacitor {...commonProps} />;
      case 'led':
        return <LED {...commonProps} />;
      case 'bulb':
        return <Bulb {...commonProps} />;
      case 'breadboard':
        return <Breadboard {...commonProps} />;
      default:
        return null;
    }
  })();

  return (
    <InstrumentFrame component={component} selected={selected}>
      {model}
    </InstrumentFrame>
  );
}
