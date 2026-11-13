import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
/** Wake on a changed animation target; each moving part requests subsequent settling frames. */
export function useAnimationWake(target: number) {
  const invalidate = useThree(s => s.invalidate);
  useEffect(() => { invalidate(); }, [invalidate, target]);
}
