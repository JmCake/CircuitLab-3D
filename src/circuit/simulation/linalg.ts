export interface LinearSolveResult {
  solution: number[] | null;
  singular: boolean;
  pivotMagnitude: number;
}

/**
 * 带部分主元的高斯消元。矩阵规模为教学电路级别（通常 < 40），
 * 因此直接求解即可，避免引入大型数值库。
 */
export function solveLinearSystem(
  matrix: number[][],
  rhs: number[],
  tolerance = 1e-13,
): LinearSolveResult {
  const n = rhs.length;
  if (n === 0) return { solution: [], singular: false, pivotMagnitude: Infinity };
  const a = matrix.map((row, index) => [...row, rhs[index]]);
  let smallestPivot = Infinity;

  for (let col = 0; col < n; col += 1) {
    let pivotRow = col;
    let pivotValue = Math.abs(a[col][col]);
    for (let row = col + 1; row < n; row += 1) {
      const value = Math.abs(a[row][col]);
      if (value > pivotValue) {
        pivotValue = value;
        pivotRow = row;
      }
    }
    if (!Number.isFinite(pivotValue) || pivotValue < tolerance) {
      return { solution: null, singular: true, pivotMagnitude: pivotValue };
    }
    smallestPivot = Math.min(smallestPivot, pivotValue);
    if (pivotRow !== col) {
      const temp = a[col];
      a[col] = a[pivotRow];
      a[pivotRow] = temp;
    }
    const pivot = a[col][col];
    for (let row = col + 1; row < n; row += 1) {
      const factor = a[row][col] / pivot;
      if (factor === 0) continue;
      a[row][col] = 0;
      for (let c = col + 1; c <= n; c += 1) {
        a[row][c] -= factor * a[col][c];
      }
    }
  }

  const x = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row -= 1) {
    let sum = a[row][n];
    for (let col = row + 1; col < n; col += 1) {
      sum -= a[row][col] * x[col];
    }
    const pivot = a[row][row];
    if (!Number.isFinite(pivot) || Math.abs(pivot) < tolerance) {
      return { solution: null, singular: true, pivotMagnitude: pivot };
    }
    x[row] = sum / pivot;
    if (!Number.isFinite(x[row])) {
      return { solution: null, singular: true, pivotMagnitude: pivot };
    }
  }
  return { solution: x, singular: false, pivotMagnitude: smallestPivot };
}
