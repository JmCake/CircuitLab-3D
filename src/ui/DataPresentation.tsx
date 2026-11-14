import { useViewStore } from '../store/viewStore';
import { DataPanel } from './DataPanel';
import { FloatingWindow } from './FloatingWindow';
export function DataPresentation() {
  return <FloatingWindow title="实验数据" presentation onClose={() => useViewStore.getState().setDataScreen(false)}><DataPanel presentation /></FloatingWindow>;
}
