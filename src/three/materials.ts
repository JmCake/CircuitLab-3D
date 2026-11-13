import * as THREE from 'three';

const standard = (options: THREE.MeshStandardMaterialParameters) =>
  new THREE.MeshStandardMaterial(options);

const physical = (options: THREE.MeshPhysicalMaterialParameters) =>
  new THREE.MeshPhysicalMaterial(options);

/**
 * 共享材质库。所有仪器零件复用这些材质，避免每次挂载都新建 GPU 材质。
 * 颜色采用低饱和工业产品配色，金属与绝缘塑料通过金属度/粗糙度区分。
 */
export const MATERIALS = {
  shellLight: standard({ color: '#d9d7d0', roughness: 0.46, metalness: 0.18 }),
  shellWarm: standard({ color: '#e4e0d7', roughness: 0.52, metalness: 0.1 }),
  shellShadow: standard({ color: '#aeb0ac', roughness: 0.58, metalness: 0.22 }),
  shellCharcoal: standard({ color: '#35393b', roughness: 0.48, metalness: 0.32 }),
  shellBlack: standard({ color: '#222527', roughness: 0.52, metalness: 0.22 }),
  panelDark: standard({ color: '#242a2c', roughness: 0.42, metalness: 0.3 }),
  panelMid: standard({ color: '#585d5d', roughness: 0.5, metalness: 0.25 }),
  panelInset: standard({ color: '#15191b', roughness: 0.55, metalness: 0.12 }),
  plasticBlack: standard({ color: '#1d1f20', roughness: 0.74, metalness: 0.02 }),
  knobGrip: standard({
    color: '#2e3031',
    roughness: 0.56,
    metalness: 0.14,
    flatShading: true,
  }),
  plasticDarkGray: standard({ color: '#3b3e3f', roughness: 0.68, metalness: 0.04 }),
  plasticLight: standard({ color: '#d4d0c5', roughness: 0.7, metalness: 0.02 }),
  plasticIvory: standard({ color: '#e9e4d8', roughness: 0.58, metalness: 0.03 }),
  redPlastic: standard({ color: '#a43a31', roughness: 0.48, metalness: 0.04 }),
  redPlasticDark: standard({ color: '#77231f', roughness: 0.58, metalness: 0.03 }),
  blackPlastic: standard({ color: '#1b1d1d', roughness: 0.6, metalness: 0.02 }),
  bluePlastic: standard({ color: '#345a72', roughness: 0.56, metalness: 0.04 }),
  rubber: standard({ color: '#1a1b1b', roughness: 0.93, metalness: 0.0 }),
  rubberSoft: standard({ color: '#272a2b', roughness: 0.88, metalness: 0.0 }),
  metal: standard({ color: '#b8b9b6', roughness: 0.26, metalness: 0.94 }),
  metalBright: standard({ color: '#d4d3cd', roughness: 0.18, metalness: 1.0 }),
  metalDark: standard({ color: '#686c6e', roughness: 0.34, metalness: 0.86 }),
  steel: standard({ color: '#8b9092', roughness: 0.38, metalness: 0.9 }),
  brass: standard({ color: '#ae8a51', roughness: 0.3, metalness: 0.88 }),
  copper: standard({ color: '#a75e37', roughness: 0.34, metalness: 0.82 }),
  coilWire: standard({ color: '#b17845', roughness: 0.32, metalness: 0.72 }),
  ceramic: standard({ color: '#e5dcc5', roughness: 0.74, metalness: 0.0 }),
  beigeCeramic: standard({ color: '#d8caaa', roughness: 0.68, metalness: 0.0 }),
  darkCeramic: standard({ color: '#5a4a3b', roughness: 0.7, metalness: 0.03 }),
  wood: standard({ color: '#a68158', roughness: 0.72, metalness: 0.0 }),
  acrylic: physical({
    color: '#d9e1dd',
    roughness: 0.1,
    metalness: 0.04,
    transparent: true,
    opacity: 0.32,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    side: THREE.DoubleSide,
  }),
  glass: physical({
    color: '#e8efea',
    roughness: 0.08,
    metalness: 0.0,
    transmission: 0.65,
    transparent: true,
    opacity: 0.55,
    thickness: 0.015,
    ior: 1.46,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    side: THREE.DoubleSide,
  }),
  screenGlass: physical({
    color: '#b6cfc8',
    roughness: 0.1,
    metalness: 0.1,
    transparent: true,
    opacity: 0.16,
    clearcoat: 1,
    depthWrite: false,
  }),
  goldContact: standard({ color: '#c6a35f', roughness: 0.24, metalness: 0.92 }),
  pcbGreen: standard({ color: '#37604d', roughness: 0.62, metalness: 0.05 }),
  pcbDark: standard({ color: '#22332b', roughness: 0.7, metalness: 0.04 }),
  redEmission: standard({
    color: '#a9342b',
    roughness: 0.35,
    metalness: 0.08,
    emissive: '#c53a28',
    emissiveIntensity: 0.35,
  }),
  accentTeal: standard({
    color: '#427a76',
    emissive: '#2a6561',
    emissiveIntensity: 0.22,
    roughness: 0.4,
    metalness: 0.22,
  }),
} as const;

export const SHARED_GEOMETRY = {
  screwHead: new THREE.CylinderGeometry(0.0062, 0.0062, 0.0024, 20),
  screwSlot: new THREE.BoxGeometry(0.0044, 0.00065, 0.0007),
  foot: new THREE.CylinderGeometry(0.016, 0.02, 0.018, 20),
  footTop: new THREE.CylinderGeometry(0.019, 0.019, 0.003, 20),
  indicatorLens: new THREE.SphereGeometry(0.0058, 16, 10),
  terminalRing: new THREE.TorusGeometry(0.016, 0.0022, 8, 24),
  tick: new THREE.BoxGeometry(0.0012, 0.006, 0.001),
} as const;

export function disposeSharedResources(): void {
  for (const material of Object.values(MATERIALS)) material.dispose();
  for (const geometry of Object.values(SHARED_GEOMETRY)) geometry.dispose();
}
