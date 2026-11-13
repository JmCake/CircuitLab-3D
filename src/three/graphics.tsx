import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { MATERIALS } from './materials';

type Vec3 = [number, number, number];

export function useDrawTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => void,
  dependencies: unknown[],
): THREE.CanvasTexture {
  const drawRef = useRef(draw);
  drawRef.current = draw;
  const canvas = useMemo(() => {
    const element = document.createElement('canvas');
    element.width = width;
    element.height = height;
    return element;
  }, [width, height]);
  const texture = useMemo(() => {
    const next = new THREE.CanvasTexture(canvas);
    next.colorSpace = THREE.SRGBColorSpace;
    next.anisotropy = 8;
    next.minFilter = THREE.LinearMipmapLinearFilter;
    next.magFilter = THREE.LinearFilter;
    next.needsUpdate = true;
    return next;
  }, [canvas]);

  useLayoutEffect(() => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    drawRef.current(ctx, canvas);
    texture.needsUpdate = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);

  useEffect(() => {
    return () => {
      texture.dispose();
    };
  }, [texture]);

  return texture;
}

interface LabelPlaneProps {
  text: string;
  width: number;
  height: number;
  position?: Vec3;
  rotation?: Vec3;
  color?: string;
  fontSize?: number;
  fontWeight?: number;
  align?: 'left' | 'center' | 'right';
  background?: string;
  border?: string;
  opacity?: number;
  fontFamily?: string;
  lineHeight?: number;
  renderOrder?: number;
}

/**
 * 高分辨率 CanvasTexture 标签。用于面板刻字、量程标识、名称牌等。
 * 透明背景使文字像丝印一样贴在机壳表面，并保持远近距离可读。
 */
export function LabelPlane({
  text,
  width,
  height,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  color = '#4a4a45',
  fontSize = 40,
  fontWeight = 600,
  align = 'center',
  background,
  border,
  opacity = 1,
  fontFamily = '"Arial Narrow", "Microsoft YaHei", "PingFang SC", sans-serif',
  lineHeight = 1.05,
  renderOrder = 4,
}: LabelPlaneProps) {
  const lines = text.split('\n');
  const textureWidth = Math.min(2048, Math.max(256, Math.round(width * 4200)));
  const textureHeight = Math.max(24, Math.round(textureWidth * (height / width)));
  const texture = useDrawTexture(
    textureWidth,
    textureHeight,
    (ctx) => {
      if (background) {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, textureWidth, textureHeight);
      }
      if (border) {
        ctx.strokeStyle = border;
        ctx.lineWidth = Math.max(2, textureHeight * 0.035);
        ctx.strokeRect(2, 2, textureWidth - 4, textureHeight - 4);
      }
      const padding = Math.max(8, Math.min(20, textureWidth * 0.03));
      const maxWidth = textureWidth - padding * 2;
      const maxHeight = textureHeight - padding * 1.1;
      // 将 fontSize 视为参考高度 96 px 下的排版值，并按物理标签的像素密度缩放。
      let fontPx = Math.max(5, fontSize * (textureHeight / 96));
      ctx.font = `${fontWeight} ${fontPx}px ${fontFamily}`;
      let widest = 0;
      for (const line of lines) widest = Math.max(widest, ctx.measureText(line).width);
      if (widest > maxWidth) fontPx *= maxWidth / widest;
      const totalHeight = fontPx * lineHeight * lines.length;
      if (totalHeight > maxHeight) fontPx *= maxHeight / totalHeight;
      fontPx = Math.max(4, fontPx);
      ctx.fillStyle = color;
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      ctx.font = `${fontWeight} ${fontPx}px ${fontFamily}`;
      const x = align === 'left' ? padding : align === 'right' ? textureWidth - padding : textureWidth / 2;
      const step = fontPx * lineHeight;
      const start = textureHeight / 2 - (step * lines.length) / 2 + step / 2;
      lines.forEach((line, index) => {
        ctx.fillText(line, x, start + step * index);
      });
    },
    [text, color, fontSize, fontWeight, align, background, border, fontFamily, lineHeight, textureWidth, textureHeight],
  );

  return (
    <mesh
      position={position}
      rotation={rotation}
      renderOrder={renderOrder}
      userData={{ skipShadow: true }}
      raycast={() => undefined}
    >
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={opacity}
        depthWrite={false}
        toneMapped={false}
        polygonOffset
        polygonOffsetFactor={-2}
      />
    </mesh>
  );
}

let glowTexture: THREE.CanvasTexture | null = null;

/**
 * 共享的柔和光晕纹理。避免使用硬边自发光球体，让 LED 与灯泡的亮度
 * 由真实电流/功率驱动的同时呈现自然的衰减边缘。
 */
export function getGlowTexture(): THREE.CanvasTexture {
  if (glowTexture) return glowTexture;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.12, 'rgba(255,255,255,0.86)');
    gradient.addColorStop(0.35, 'rgba(255,255,255,0.4)');
    gradient.addColorStop(0.65, 'rgba(255,255,255,0.12)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  glowTexture = new THREE.CanvasTexture(canvas);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  glowTexture.needsUpdate = true;
  return glowTexture;
}

const SEGMENTS: Record<string, boolean[]> = {
  '0': [true, true, true, true, true, true, false],
  '1': [false, true, true, false, false, false, false],
  '2': [true, true, false, true, true, false, true],
  '3': [true, true, true, true, false, false, true],
  '4': [false, true, true, false, false, true, true],
  '5': [true, false, true, true, false, true, true],
  '6': [true, false, true, true, true, true, true],
  '7': [true, true, true, false, false, false, false],
  '8': [true, true, true, true, true, true, true],
  '9': [true, true, true, true, false, true, true],
  '-': [false, false, false, false, false, false, true],
  'E': [true, false, false, true, true, true, true],
  'r': [false, false, false, false, true, false, true],
};

function drawSegmentDigit(
  ctx: CanvasRenderingContext2D,
  char: string,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  faintColor: string,
  lineWidth: number,
  glow: number,
): void {
  if (char === '.' || char === ',') {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + w * 0.54, y + h, lineWidth * 0.62, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const segments = SEGMENTS[char] ?? SEGMENTS['-'];
  const inset = lineWidth * 0.85;
  const left = x + inset;
  const right = x + w - inset;
  const top = y + inset;
  const middle = y + h / 2;
  const bottom = y + h - inset;
  const paths: [number, number, number, number][] = [
    [left + inset, top, right - inset, top],
    [right, top + inset, right, middle - inset],
    [right, middle + inset, right, bottom - inset],
    [left + inset, bottom, right - inset, bottom],
    [left, middle + inset, left, bottom - inset],
    [left, top + inset, left, middle - inset],
    [left + inset, middle, right - inset, middle],
  ];
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass += 1) {
    ctx.beginPath();
    ctx.strokeStyle = pass === 0 ? faintColor : color;
    ctx.lineWidth = pass === 0 ? lineWidth * 0.62 : lineWidth;
    if (pass === 1 && glow > 0) {
      ctx.shadowColor = color;
      ctx.shadowBlur = glow;
    } else {
      ctx.shadowBlur = 0;
    }
    for (let i = 0; i < paths.length; i += 1) {
      if (pass === 0 && segments[i]) continue;
      if (pass === 1 && !segments[i]) continue;
      const [x1, y1, x2, y2] = paths[i];
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function formatDisplay(value: number | null, unit: string): { text: string; unit: string } {
  if (value === null || !Number.isFinite(value)) {
    return { text: '----', unit };
  }
  const abs = Math.abs(value);
  if (unit === 'A') {
    if (abs < 1) return { text: (value * 1000).toFixed(2), unit: 'mA' };
    return { text: value.toFixed(3), unit: 'A' };
  }
  if (unit === 'V') {
    if (abs >= 100) return { text: value.toFixed(1), unit: 'V' };
    return { text: value.toFixed(2), unit: 'V' };
  }
  if (unit === 'W') {
    if (abs < 0.1) return { text: (value * 1000).toFixed(0), unit: 'mW' };
    return { text: value.toFixed(3), unit: 'W' };
  }
  if (unit === 'Ω') return { text: Math.round(value).toString(), unit: 'Ω' };
  return { text: value.toFixed(2), unit };
}

interface DigitalDisplayProps {
  value: number | null;
  unit: 'V' | 'A' | 'Ω' | 'W';
  label?: string;
  width: number;
  height: number;
  position: Vec3;
  color?: string;
  off?: boolean;
  warning?: boolean;
}

/**
 * 七段式数字显示屏。数值完全由外部仿真快照传入，组件自身不生成任何读数。
 */
export function DigitalDisplay({
  value,
  unit,
  label = '',
  width,
  height,
  position,
  color = '#8cf4c9',
  off = false,
  warning = false,
}: DigitalDisplayProps) {
  const formatted = formatDisplay(off ? null : value, unit);
  const screenColor = warning ? '#ffb45f' : color;
  const textureHeight = 280;
  const textureWidth = Math.min(1600, Math.max(460, Math.round((width / height) * textureHeight)));
  const texture = useDrawTexture(
    textureWidth,
    textureHeight,
    (ctx) => {
      const w = textureWidth;
      const h = textureHeight;
      const gradient = ctx.createLinearGradient(0, 0, w, h);
      gradient.addColorStop(0, '#0a1413');
      gradient.addColorStop(0.55, '#07100f');
      gradient.addColorStop(1, '#0c1514');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);

      const vignette = ctx.createRadialGradient(w / 2, h * 0.48, 20, w / 2, h * 0.48, w * 0.7);
      vignette.addColorStop(0, 'rgba(130, 220, 190, 0.06)');
      vignette.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, w, h);

      if (label) {
        ctx.fillStyle = off ? 'rgba(130, 170, 160, 0.24)' : 'rgba(158, 217, 201, 0.55)';
        ctx.font = `500 ${Math.round(h * 0.082)}px "Arial Narrow", "Microsoft YaHei", sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label.toUpperCase(), w * 0.045, h * 0.1);
        ctx.strokeStyle = off ? 'rgba(130, 170, 160, 0.08)' : 'rgba(158, 217, 201, 0.14)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(w * 0.045, h * 0.165);
        ctx.lineTo(w * 0.955, h * 0.165);
        ctx.stroke();
      }

      if (off) {
        ctx.fillStyle = 'rgba(167, 211, 198, 0.26)';
        ctx.font = `500 ${Math.round(h * 0.18)}px "Arial Narrow", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('OFF', w * 0.48, h * 0.56);
        return;
      }

      const rawText = formatted.text;
      const text = rawText.length > 7 ? rawText.slice(-7) : rawText;
      const valueLeft = w * 0.045;
      const valueRight = w * 0.825;
      const top = h * 0.27;
      const bottom = h * 0.87;
      let cellUnits = 0;
      for (const char of text) {
        if (char === '.' || char === ',') cellUnits += 0.34;
        else if (char === '-') cellUnits += 0.48;
        else cellUnits += 1;
      }
      const cellWidth = Math.min(h * 0.52, (valueRight - valueLeft) / Math.max(1, cellUnits));
      const digitHeight = Math.min(bottom - top, cellWidth * 1.62);
      const lineWidth = Math.max(4, cellWidth * 0.105);
      const totalWidth = text.split('').reduce((sum, char) => {
        if (char === '.' || char === ',') return sum + cellWidth * 0.34;
        if (char === '-') return sum + cellWidth * 0.48;
        return sum + cellWidth;
      }, 0);
      let cursor = valueLeft + Math.max(0, (valueRight - valueLeft - totalWidth) / 2);
      const centerY = top + (bottom - top - digitHeight) / 2;
      const faint = 'rgba(104, 160, 146, 0.09)';
      for (const char of text) {
        if (char === '.' || char === ',') {
          const dotWidth = cellWidth * 0.34;
          drawSegmentDigit(
            ctx,
            char,
            cursor,
            centerY + digitHeight * 0.18,
            dotWidth,
            digitHeight * 0.82,
            screenColor,
            faint,
            lineWidth,
            12,
          );
          cursor += dotWidth;
        } else if (char === '-') {
          drawSegmentDigit(
            ctx,
            char,
            cursor,
            centerY,
            cellWidth * 0.48,
            digitHeight,
            screenColor,
            faint,
            lineWidth,
            12,
          );
          cursor += cellWidth * 0.48;
        } else {
          drawSegmentDigit(
            ctx,
            char,
            cursor + cellWidth * 0.1,
            centerY,
            cellWidth * 0.8,
            digitHeight,
            screenColor,
            faint,
            lineWidth,
            14,
          );
          cursor += cellWidth;
        }
      }

      ctx.save();
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = screenColor;
      ctx.shadowColor = screenColor;
      ctx.shadowBlur = 10;
      ctx.font = `600 ${Math.round(h * 0.18)}px "Bahnschrift", "Arial Narrow", sans-serif`;
      ctx.fillText(formatted.unit, w * 0.955, h * 0.8);
      ctx.restore();

      ctx.strokeStyle = 'rgba(139, 211, 190, 0.12)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(w - h * 0.25, h * 0.23);
      ctx.lineTo(w - h * 0.07, h * 0.23);
      ctx.stroke();

      if (warning) {
        ctx.fillStyle = '#ffb45f';
        ctx.font = `700 ${Math.round(h * 0.085)}px "Arial", sans-serif`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText('OVER', w - h * 0.06, h * 0.48);
      }

      for (let y = 0; y < h; y += 4) {
        ctx.fillStyle = 'rgba(255,255,255,0.012)';
        ctx.fillRect(0, y, w, 1);
      }
    },
    [formatted.text, formatted.unit, label, screenColor, off, warning, textureWidth, textureHeight],
  );

  return (
    <group position={position}>
      <mesh
        position={[0, 0, 0.0015]}
        renderOrder={6}
        userData={{ skipShadow: true }}
        raycast={() => undefined}
      >
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial map={texture} toneMapped={false} transparent depthWrite={false} />
      </mesh>
      <mesh
        position={[0, 0, 0.0027]}
        renderOrder={7}
        userData={{ skipShadow: true }}
        raycast={() => undefined}
      >
        <planeGeometry args={[width, height]} />
        <meshPhysicalMaterial
          color="#bcd3cd"
          roughness={0.08}
          metalness={0.12}
          transparent
          opacity={0.13}
          clearcoat={1}
          clearcoatRoughness={0.04}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

export function IndicatorLamp({
  position,
  color = '#ff5b4a',
  on = false,
  size = 0.006,
}: {
  position: Vec3;
  color?: string;
  on?: boolean;
  size?: number;
}) {
  return (
    <group position={position}>
      <mesh position={[0, 0, -0.001]}>
        <cylinderGeometry args={[size * 1.45, size * 1.55, 0.004, 20]} />
        <meshStandardMaterial color="#3a3a38" roughness={0.4} metalness={0.7} />
      </mesh>
      <mesh position={[0, 0, 0.0018]}>
        <sphereGeometry args={[size, 18, 12]} />
        <meshPhysicalMaterial
          color={on ? color : '#5a3430'}
          emissive={on ? color : '#000000'}
          emissiveIntensity={on ? 3.2 : 0}
          roughness={0.22}
          metalness={0.05}
          transparent
          opacity={0.94}
          clearcoat={1}
        />
      </mesh>
      {on && (
        <mesh position={[0, 0, 0.0018]}>
          <sphereGeometry args={[size * 1.44, 18, 12]} />
          <meshBasicMaterial color={color} transparent opacity={0.12} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

export function makeWireMaterial(color: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.48,
    metalness: 0.04,
  });
}

export { MATERIALS };
