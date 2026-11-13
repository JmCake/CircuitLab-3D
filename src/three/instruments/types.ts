import type { ElementResult, LabComponent } from '../../circuit';

export interface InstrumentModelProps {
  component: LabComponent;
  selected: boolean;
  element?: ElementResult;
}
