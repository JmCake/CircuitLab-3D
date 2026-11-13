import { useEffect, useMemo } from 'react';
import { ContactShadows, Environment, Lightformer, RoundedBox, SoftShadows } from '@react-three/drei';
import * as THREE from 'three';
import { LabelPlane, useDrawTexture } from './graphics';
import { MATERIALS } from './materials';
import { StaticGeometryBatch } from './StaticGeometryBatch';
import { useViewStore } from '../store/viewStore';

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0xffffffff;
  };
}

function useCanvasMaterialTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
  options?: { repeat?: [number, number]; colorSpace?: THREE.ColorSpace },
): THREE.CanvasTexture {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) draw(ctx);
    const next = new THREE.CanvasTexture(canvas);
    next.colorSpace = options?.colorSpace ?? THREE.SRGBColorSpace;
    next.anisotropy = 8;
    if (options?.repeat) {
      next.wrapS = THREE.RepeatWrapping;
      next.wrapT = THREE.RepeatWrapping;
      next.repeat.set(options.repeat[0], options.repeat[1]);
    }
    next.needsUpdate = true;
    return next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

function TableTop() {
  const texture = useCanvasMaterialTexture(1024, 512, (ctx) => {
    const random = seededRandom(9182);
    ctx.fillStyle = '#c8c2b6';
    ctx.fillRect(0, 0, 1024, 512);
    const gradient = ctx.createLinearGradient(0, 0, 1024, 512);
    gradient.addColorStop(0, 'rgba(255,250,238,0.28)');
    gradient.addColorStop(0.45, 'rgba(255,255,255,0)');
    gradient.addColorStop(1, 'rgba(69,66,60,0.15)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 16000; i += 1) {
      const x = random() * 1024;
      const y = random() * 512;
      const alpha = 0.02 + random() * 0.05;
      ctx.fillStyle = random() > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(62,59,54,${alpha * 0.9})`;
      ctx.fillRect(x, y, 1 + random() * 1.4, 1);
    }
    for (let i = 0; i < 48; i += 1) {
      const y = random() * 512;
      ctx.strokeStyle = `rgba(103,98,89,${0.02 + random() * 0.05})`;
      ctx.lineWidth = 0.8 + random() * 1.1;
      ctx.beginPath();
      ctx.moveTo(random() * 900, y);
      ctx.bezierCurveTo(300 + random() * 300, y + random() * 7, 600 + random() * 200, y - random() * 6, 1024, y + random() * 3);
      ctx.stroke();
    }
    for (let i = 0; i < 400; i += 1) {
      ctx.fillStyle = `rgba(93, 88, 79, ${0.025 + random() * 0.035})`;
      ctx.fillRect(random() * 1024, random() * 512, 1, 1);
    }
  }, { repeat: [1, 1] });

  return (
    <group>
      <RoundedBoxTop />
      <mesh position={[0, 0.0012, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[2.214, 1.134]} />
        <meshStandardMaterial map={texture} roughness={0.67} metalness={0.035} color="#f4f1ea" />
      </mesh>
      {[
        { position: [0, -0.024, 0.579] as [number, number, number], args: [2.248, 0.03, 0.005] as [number, number, number] },
        { position: [0, -0.024, -0.579] as [number, number, number], args: [2.248, 0.03, 0.005] as [number, number, number] },
        { position: [1.118, -0.024, 0] as [number, number, number], args: [0.005, 0.03, 1.158] as [number, number, number] },
        { position: [-1.118, -0.024, 0] as [number, number, number], args: [0.005, 0.03, 1.158] as [number, number, number] },
      ].map((strip, index) => (
        <mesh key={index} position={strip.position} material={MATERIALS.shellCharcoal}>
          <boxGeometry args={strip.args} />
        </mesh>
      ))}
    </group>
  );
}

function RoundedBoxTop() {
  return (
    <RoundedBox
      args={[2.24, 0.054, 1.16]}
      radius={0.011}
      smoothness={4}
      position={[0, -0.027, 0]}
      castShadow
      receiveShadow
      material={MATERIALS.shellWarm}
    />
  );
}

function Floor() {
  const texture = useCanvasMaterialTexture(512, 512, (ctx) => {
    const random = seededRandom(4417);
    ctx.fillStyle = '#bab6ae';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 6000; i += 1) {
      const alpha = 0.02 + random() * 0.035;
      ctx.fillStyle = random() > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(78,78,74,${alpha})`;
      ctx.fillRect(random() * 512, random() * 512, 1.3, 1.3);
    }
    const sheen = ctx.createLinearGradient(0, 0, 512, 512);
    sheen.addColorStop(0, 'rgba(255,255,255,0.08)');
    sheen.addColorStop(0.55, 'rgba(255,255,255,0)');
    sheen.addColorStop(1, 'rgba(56,55,51,0.08)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = 'rgba(111,109,103,0.38)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 510, 510);
  }, { repeat: [8, 8] });

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.79, 0]} receiveShadow>
      <planeGeometry args={[8, 8]} />
      <meshStandardMaterial map={texture} roughness={0.78} metalness={0.03} color="#f1eee8" />
    </mesh>
  );
}

function SoftFloorShadow() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const gradient = ctx.createRadialGradient(256, 256, 20, 256, 256, 256);
      gradient.addColorStop(0, 'rgba(20,22,22,0.35)');
      gradient.addColorStop(0.5, 'rgba(20,22,22,0.17)');
      gradient.addColorStop(1, 'rgba(20,22,22,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 512, 512);
    }
    const next = new THREE.CanvasTexture(canvas);
    next.colorSpace = THREE.SRGBColorSpace;
    return next;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.786, 0]}>
      <planeGeometry args={[3.4, 2.2]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} opacity={0.6} />
    </mesh>
  );
}

function Bench() {
  return (
    <group>
      <TableTop />
      <mesh position={[0, -0.056, 0]} castShadow material={MATERIALS.shellCharcoal}>
        <boxGeometry args={[2.255, 0.018, 1.175]} />
      </mesh>
      <mesh position={[0, -0.083, 0.568]} castShadow material={MATERIALS.shellShadow}>
        <boxGeometry args={[2.03, 0.076, 0.022]} />
      </mesh>
      <mesh position={[0, -0.083, -0.568]} castShadow material={MATERIALS.shellShadow}>
        <boxGeometry args={[2.03, 0.076, 0.022]} />
      </mesh>
      <mesh position={[0, -0.13, 0]} material={MATERIALS.metalDark}>
        <boxGeometry args={[1.94, 0.045, 0.07]} />
      </mesh>

      {/* 钢制桌腿与横梁 */}
      {[
        [-0.97, -0.43],
        [0.97, -0.43],
        [-0.97, 0.43],
        [0.97, 0.43],
      ].map(([x, z]) => (
        <group key={`${x}-${z}`} position={[x, 0, z]}>
          <mesh position={[0, -0.427, 0]} castShadow receiveShadow material={MATERIALS.shellCharcoal}>
            <boxGeometry args={[0.058, 0.72, 0.058]} />
          </mesh>
          <mesh position={[0, -0.782, 0]} material={MATERIALS.rubber}>
            <cylinderGeometry args={[0.038, 0.042, 0.022, 18]} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, -0.58, -0.43]} castShadow material={MATERIALS.metalDark}>
        <boxGeometry args={[1.9, 0.035, 0.038]} />
      </mesh>
      <mesh position={[0, -0.35, 0.43]} castShadow material={MATERIALS.metalDark}>
        <boxGeometry args={[1.9, 0.028, 0.03]} />
      </mesh>
      {[-0.88, 0.88].map((x) => (
        <mesh key={x} position={[x, -0.4, 0]} castShadow material={MATERIALS.metalDark}>
          <boxGeometry args={[0.028, 0.03, 0.82]} />
        </mesh>
      ))}

      {/* 桌面下的抽屉柜和线缆槽 */}
      <group position={[-0.22, -0.155, 0.06]}>
        <mesh castShadow material={MATERIALS.shellShadow}>
          <boxGeometry args={[0.62, 0.14, 0.36]} />
        </mesh>
        <mesh position={[0, 0.02, 0.1815]} material={MATERIALS.shellCharcoal}>
          <boxGeometry args={[0.605, 0.056, 0.008]} />
        </mesh>
        <mesh position={[0, -0.043, 0.1815]} material={MATERIALS.shellCharcoal}>
          <boxGeometry args={[0.605, 0.056, 0.008]} />
        </mesh>
        <mesh position={[0, 0.02, 0.192]} material={MATERIALS.metal}>
          <boxGeometry args={[0.13, 0.008, 0.012]} />
        </mesh>
        <mesh position={[0, -0.043, 0.192]} material={MATERIALS.metal}>
          <boxGeometry args={[0.13, 0.008, 0.012]} />
        </mesh>
      </group>
      <mesh position={[0, -0.26, -0.5]} material={MATERIALS.metalDark}>
        <boxGeometry args={[1.45, 0.03, 0.12]} />
      </mesh>
      <mesh position={[0, -0.24, -0.5]} material={MATERIALS.rubberSoft}>
        <boxGeometry args={[1.38, 0.008, 0.09]} />
      </mesh>

      {/* 桌面铭牌 */}
      <mesh position={[0.05, -0.079, 0.582]} material={MATERIALS.metalDark}>
        <boxGeometry args={[0.42, 0.032, 0.006]} />
      </mesh>
      <LabelPlane
        text="CIRCUITLAB-3D  ·  电路基础实验室"
        width={0.36}
        height={0.02}
        position={[0.05, -0.079, 0.586]}
        color="#d9d1c1"
        fontSize={32}
        fontWeight={600}
      />

      {/* 后排实验电源排插 */}
      <group position={[0.01, 0.014, -0.51]}>
        <mesh castShadow material={MATERIALS.panelDark}>
          <boxGeometry args={[0.52, 0.026, 0.064]} />
        </mesh>
        {[-0.18, -0.09, 0, 0.09, 0.18].map((x) => (
          <mesh key={x} position={[x, 0.004, 0.022]} material={MATERIALS.panelInset}>
            <boxGeometry args={[0.046, 0.008, 0.02]} />
          </mesh>
        ))}
        <mesh position={[0.226, 0.008, 0.024]} material={MATERIALS.redPlastic}>
          <boxGeometry args={[0.018, 0.012, 0.01]} />
        </mesh>
        <mesh position={[0.247, 0.013, 0.03]}>
          <sphereGeometry args={[0.003, 10, 8]} />
          <meshBasicMaterial color="#7df0a6" toneMapped={false} />
        </mesh>
        <mesh position={[-0.245, 0.002, -0.045]} rotation={[0, 0, Math.PI / 2]} material={MATERIALS.rubber}>
          <cylinderGeometry args={[0.008, 0.008, 0.2, 10]} />
        </mesh>
      </group>
    </group>
  );
}

function LabWall() {
  return (
    <group>
      {/* 后墙与侧墙 */}
      <mesh position={[0, 0.8, -4]} receiveShadow material={MATERIALS.shellWarm}>
        <boxGeometry args={[8, 3.2, 0.1]} />
      </mesh>
      <mesh position={[-4, 0.8, 0]} receiveShadow material={MATERIALS.shellWarm}>
        <boxGeometry args={[0.1, 3.2, 8]} />
      </mesh>
      <mesh position={[4, 0.8, 0]} receiveShadow material={MATERIALS.shellWarm}>
        <boxGeometry args={[0.1, 3.2, 8]} />
      </mesh>
      <mesh position={[0, 0.8, 4]} receiveShadow material={MATERIALS.shellWarm}>
        <boxGeometry args={[8, 3.2, 0.1]} />
      </mesh>
      <mesh position={[0, 2.4, 0]} receiveShadow material={MATERIALS.shellLight}>
        <boxGeometry args={[8, 0.08, 8]} />
      </mesh>

      {/* 墙裙、踢脚线与板缝 */}
      <mesh position={[0, -0.35, -3.94]} material={MATERIALS.shellShadow}>
        <boxGeometry args={[7.94, 0.9, 0.03]} />
      </mesh>
      <mesh position={[0, 0.1, -3.925]} material={MATERIALS.shellShadow}>
        <boxGeometry args={[7.94, 0.028, 0.05]} />
      </mesh>
      <mesh position={[0, -0.735, -3.91]} material={MATERIALS.shellCharcoal}>
        <boxGeometry args={[7.94, 0.11, 0.055]} />
      </mesh>
      <mesh position={[-4, -0.35, 0]} material={MATERIALS.shellShadow}>
        <boxGeometry args={[0.03, 0.9, 7.94]} />
      </mesh>
      <mesh position={[4, -0.35, 0]} material={MATERIALS.shellShadow}>
        <boxGeometry args={[0.03, 0.9, 7.94]} />
      </mesh>
      {[4, 4].map((x, index) => (
        <mesh key={index} position={[x, 1.4, -3.94]} material={MATERIALS.shellShadow}>
          <boxGeometry args={[0.012, 1.5, 0.012]} />
        </mesh>
      ))}
      <mesh position={[1.94, 1.32, -3.936]} material={MATERIALS.shellShadow}>
        <boxGeometry args={[0.012, 1.55, 0.01]} />
      </mesh>
      <mesh position={[-1.94, 1.32, -3.936]} material={MATERIALS.shellShadow}>
        <boxGeometry args={[0.012, 1.55, 0.01]} />
      </mesh>

      {/* 左后实验柜 */}
      <group position={[-2.72, 0.03, -3.58]}>
        <mesh castShadow receiveShadow material={MATERIALS.shellLight}>
          <boxGeometry args={[1.18, 1.72, 0.48]} />
        </mesh>
        <mesh position={[0, 0.35, 0.246]} material={MATERIALS.shellShadow}>
          <boxGeometry args={[1.12, 0.78, 0.012]} />
        </mesh>
        <mesh position={[0, -0.45, 0.246]} material={MATERIALS.shellShadow}>
          <boxGeometry args={[1.12, 0.66, 0.012]} />
        </mesh>
        <mesh position={[0, 0.35, 0.255]} material={MATERIALS.panelDark}>
          <boxGeometry args={[0.012, 0.76, 0.008]} />
        </mesh>
        {[-0.22, 0.22].map((x) => (
          <mesh key={x} position={[x, 0.35, 0.258]} material={MATERIALS.metal}>
            <boxGeometry args={[0.075, 0.008, 0.012]} />
          </mesh>
        ))}
        <mesh position={[0, -0.45, 0.255]} material={MATERIALS.metal}>
          <boxGeometry args={[0.16, 0.01, 0.012]} />
        </mesh>
        {[0.72, 0.62, 0.52].map((y, index) => (
          <mesh key={index} position={[0.46, y - 0.4, 0.256]} material={MATERIALS.shellCharcoal}>
            <boxGeometry args={[0.16, 0.055, 0.02]} />
          </mesh>
        ))}
        <mesh position={[0, 0.86, 0]} material={MATERIALS.shellShadow}>
          <boxGeometry args={[1.2, 0.04, 0.5]} />
        </mesh>
        <LabelPlane
          text="器件柜  ·  COMPONENTS"
          width={0.35}
          height={0.024}
          position={[0.34, 0.52, 0.252]}
          color="#716a5f"
          fontSize={31}
        />
      </group>

      {/* 白板 */}
      <group position={[0.2, 0.86, -3.93]}>
        <mesh material={MATERIALS.metalDark}>
          <boxGeometry args={[2.62, 1.37, 0.025]} />
        </mesh>
        <WhiteboardTexture />
        <mesh position={[0, -0.66, 0.08]} material={MATERIALS.metalDark}>
          <boxGeometry args={[1.2, 0.025, 0.12]} />
        </mesh>
        {[-0.35, -0.24, -0.13].map((x, index) => (
          <mesh key={index} position={[x, -0.643, 0.12]} rotation={[0, 0, Math.PI / 2]} material={MATERIALS.panelMid}>
            <cylinderGeometry args={[0.008, 0.008, 0.12, 10]} />
          </mesh>
        ))}
      </group>

      {/* 右侧磨砂采光窗 */}
      <group position={[2.72, 0.82, -3.9]}>
        <mesh material={MATERIALS.metalDark}>
          <boxGeometry args={[1.48, 1.7, 0.05]} />
        </mesh>
        <mesh position={[0, 0, 0.033]}>
          <planeGeometry args={[1.32, 1.54]} />
          <meshBasicMaterial color="#efe8d9" toneMapped={false} />
        </mesh>
        <mesh position={[0, 0, 0.038]}>
          <planeGeometry args={[1.32, 1.54]} />
          <meshPhysicalMaterial color="#f7f1e4" roughness={0.8} transparent opacity={0.42} />
        </mesh>
        {[-0.6, -0.3, 0, 0.3, 0.6].map((y) => (
          <mesh key={y} position={[0, y, 0.045]} material={MATERIALS.shellShadow}>
            <boxGeometry args={[1.24, 0.012, 0.008]} />
          </mesh>
        ))}
        <mesh position={[0, 0, 0.05]} material={MATERIALS.metal}>
          <boxGeometry args={[0.014, 1.5, 0.012]} />
        </mesh>
        <mesh position={[0, 0, 0.05]} material={MATERIALS.metal}>
          <boxGeometry args={[1.3, 0.014, 0.012]} />
        </mesh>
      </group>

      <mesh position={[2.72, -0.44, -3.69]} castShadow material={MATERIALS.shellShadow}>
        <boxGeometry args={[1.6, 1.0, 0.42]} />
      </mesh>
      <mesh position={[2.72, 0.076, -3.69]} material={MATERIALS.shellLight}>
        <boxGeometry args={[1.64, 0.04, 0.46]} />
      </mesh>

      <LabelPlane
        text="ELECTRICAL ENGINEERING  ·  CIRCUIT LAB 03"
        width={2.1}
        height={0.1}
        position={[0, 1.86, -3.89]}
        color="#7b766b"
        fontSize={38}
        fontWeight={600}
      />
      <mesh position={[0, 1.79, -3.88]} material={MATERIALS.shellShadow}>
        <boxGeometry args={[2.25, 0.006, 0.006]} />
      </mesh>
    </group>
  );
}

function WhiteboardTexture() {
  const texture = useDrawTexture(
    1200,
    620,
    (ctx) => {
      ctx.fillStyle = '#f4f2ea';
      ctx.fillRect(0, 0, 1200, 620);
      const gradient = ctx.createLinearGradient(0, 0, 1200, 620);
      gradient.addColorStop(0, 'rgba(255,255,255,0.28)');
      gradient.addColorStop(1, 'rgba(107,110,103,0.08)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 1200, 620);
      ctx.fillStyle = '#42514f';
      ctx.font = '600 38px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('电路基础  ·  CIRCUIT FUNDAMENTALS', 54, 70);
      ctx.strokeStyle = 'rgba(61, 102, 98, 0.55)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(54, 92);
      ctx.lineTo(1140, 92);
      ctx.stroke();

      ctx.fillStyle = '#5b6a67';
      ctx.font = '500 27px "Microsoft YaHei", sans-serif';
      ctx.fillText('本周实验：欧姆定律 / 串联与并联 / RC 暂态', 54, 135);

      // 手绘电路示意图
      ctx.strokeStyle = 'rgba(57, 84, 83, 0.72)';
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.rect(92, 215, 430, 205);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(92, 317);
      ctx.lineTo(165, 317);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(165, 289);
      ctx.lineTo(165, 345);
      ctx.moveTo(188, 305);
      ctx.lineTo(188, 329);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(188, 317);
      ctx.lineTo(280, 317);
      ctx.lineTo(300, 290);
      ctx.lineTo(320, 344);
      ctx.lineTo(340, 290);
      ctx.lineTo(360, 344);
      ctx.lineTo(380, 317);
      ctx.lineTo(470, 317);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(92, 317, 7, 0, Math.PI * 2);
      ctx.arc(470, 317, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#536965';
      ctx.font = '24px "Arial Narrow", sans-serif';
      ctx.fillText('U', 119, 300);
      ctx.fillText('R', 324, 275);
      ctx.fillText('I', 438, 300);

      ctx.fillStyle = 'rgba(58, 79, 76, 0.75)';
      ctx.font = 'italic 500 34px "Times New Roman", serif';
      ctx.fillText('U = I · R', 625, 250);
      ctx.fillText('Σ I = 0', 625, 315);
      ctx.fillText('Σ U = 0', 625, 380);
      ctx.font = '500 23px "Microsoft YaHei", sans-serif';
      ctx.fillStyle = 'rgba(91, 105, 99, 0.8)';
      ctx.fillText('测量前先检查量程与极性', 625, 455);
      ctx.fillText('电流表串联，电压表并联', 625, 489);

      ctx.strokeStyle = 'rgba(135, 107, 68, 0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(600, 148);
      ctx.lineTo(600, 530);
      ctx.stroke();

      // 角上的小磁铁和便签字迹
      ctx.fillStyle = 'rgba(170, 122, 78, 0.85)';
      ctx.fillRect(1015, 496, 92, 72);
      ctx.save();
      ctx.translate(1061, 531);
      ctx.rotate(-0.06);
      ctx.fillStyle = '#f6eddb';
      ctx.font = '500 19px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('记录数据', 0, 0);
      ctx.fillText('检查接线', 0, 26);
      ctx.restore();
    },
    [],
  );
  return (
    <mesh position={[0, 0, 0.018]} userData={{ skipShadow: true }}>
      <planeGeometry args={[2.55, 1.31]} />
      <meshStandardMaterial map={texture} roughness={0.8} metalness={0.02} />
    </mesh>
  );
}

function RoomLighting() {
  return (
    <>
      <ambientLight intensity={0.2} color="#fffaf0" />
      <hemisphereLight args={['#f6f7f0', '#5a6061', 0.8]} />
      <directionalLight
        position={[2.4, 3.6, 2.6]}
        intensity={2.4}
        color="#fff2dd"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-2.2}
        shadow-camera-right={2.2}
        shadow-camera-top={2.2}
        shadow-camera-bottom={-2.2}
        shadow-camera-near={0.4}
        shadow-camera-far={8}
        shadow-bias={-0.00025}
        shadow-normalBias={0.018}
      />
      <directionalLight position={[-2.8, 2.0, 0.5]} intensity={0.3} color="#dbe6e8" />
      <pointLight position={[0, 2.1, 0.7]} intensity={0.2} color="#fff2da" distance={5} decay={2} />
      <Environment resolution={96} frames={1} background={false} environmentIntensity={0.48}>
        <Lightformer
          form="rect"
          intensity={2.1}
          color="#fff6e2"
          scale={[5, 3, 1]}
          position={[3, 3.5, 2]}
          target={[0, 0, 0]}
        />
        <Lightformer
          form="rect"
          intensity={0.7}
          color="#d9e8ee"
          scale={[4, 2, 1]}
          position={[-3, 1.5, 1]}
          target={[0, 0, 0]}
        />
        <Lightformer
          form="ring"
          intensity={0.55}
          color="#f6e8ce"
          scale={[2.2, 2.2, 1]}
          position={[0, 4, -2]}
          target={[0, 0, 0]}
        />
      </Environment>
    </>
  );
}

export function SceneEnvironment() {
  const quality = useViewStore(s => s.quality);
  return (
    <>
      {quality === 'fine' && <SoftShadows size={4} samples={24} focus={0.4} />}
      <color attach="background" args={['#dcd8d0']} />
      <fog attach="fog" args={['#ddd9d1', 6.2, 13]} />
      <RoomLighting />
      <StaticGeometryBatch>
        <Floor />
        <SoftFloorShadow />
        <LabWall />
        <Bench />
      </StaticGeometryBatch>
      <ContactShadows
        position={[0, -0.788, 0]}
        scale={[3.2, 2.1]}
        opacity={0.28}
        blur={2.6}
        far={1.2}
        resolution={256}
        frames={1}
        color="#1b1d1d"
      />
    </>
  );
}
