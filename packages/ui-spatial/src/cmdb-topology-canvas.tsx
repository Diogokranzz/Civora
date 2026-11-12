'use client';

import * as React from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, Line, OrbitControls } from '@react-three/drei';
import type * as THREE from 'three';
import {
  type AssetVisualKind,
  type CascadeAnalysisResult,
  classifyAssetVisualKind,
  type TopologyAssetNode,
  type TopologyEdge,
  type TopologyPosition3D,
} from './topology-math';

interface NodeStyle {
  baseColor: string;
  emissive: string;
  emissiveIntensity: number;
  ringColor: string | null;
  scale: number;
}

function resolveNodeVisualStyle(
  node: TopologyAssetNode,
  cascadeDepth: number | undefined,
  isSelected: boolean,
): NodeStyle {
  if (cascadeDepth === 0) {
    return {
      baseColor: '#EF4444',
      emissive: '#DC2626',
      emissiveIntensity: 0.95,
      ringColor: '#FCA5A5',
      scale: isSelected ? 1.28 : 1.15,
    };
  }
  if (cascadeDepth !== undefined && cascadeDepth > 0) {
    return {
      baseColor: '#F59E0B',
      emissive: '#D97706',
      emissiveIntensity: 0.78,
      ringColor: '#FDE68A',
      scale: isSelected ? 1.2 : 1.08,
    };
  }
  if (node.status === 'IN_MAINTENANCE' || node.status === 'MAINTENANCE') {
    return {
      baseColor: '#8B5CF6',
      emissive: '#6D28D9',
      emissiveIntensity: 0.5,
      ringColor: isSelected ? '#C4B5FD' : null,
      scale: isSelected ? 1.16 : 1,
    };
  }
  return {
    baseColor: isSelected ? '#60A5FA' : '#0EA5E9',
    emissive: isSelected ? '#2563EB' : '#0284C7',
    emissiveIntensity: isSelected ? 0.75 : 0.42,
    ringColor: isSelected ? '#BAE6FD' : null,
    scale: isSelected ? 1.18 : 1,
  };
}

function AssetGeometry({ kind }: { kind: AssetVisualKind }) {
  switch (kind) {
    case 'network':
      return <octahedronGeometry args={[0.36, 0]} />;
    case 'database':
      return <cylinderGeometry args={[0.28, 0.28, 0.5, 20]} />;
    case 'compute':
      return <boxGeometry args={[0.46, 0.34, 0.46]} />;
    case 'service':
      return <icosahedronGeometry args={[0.32, 0]} />;
    default:
      return <dodecahedronGeometry args={[0.28, 0]} />;
  }
}

function AssetTopologyMesh({
  node,
  position,
  cascadeDepth,
  isSelected,
  showHtmlLabel,
  reducedMotion,
  onSelect,
}: {
  node: TopologyAssetNode;
  position: TopologyPosition3D;
  cascadeDepth: number | undefined;
  isSelected: boolean;
  showHtmlLabel: boolean;
  reducedMotion: boolean;
  onSelect: (id: string) => void;
}) {
  const meshRef = React.useRef<THREE.Mesh>(null);
  const haloRef = React.useRef<THREE.Mesh>(null);
  const kind = React.useMemo(() => classifyAssetVisualKind(node.assetType), [node.assetType]);
  const style = resolveNodeVisualStyle(node, cascadeDepth, isSelected);
  const isImpacted = cascadeDepth !== undefined;

  useFrame((state, delta) => {
    if (reducedMotion) return;
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * (cascadeDepth === 0 ? 0.9 : 0.35);
    }
    if (haloRef.current && isImpacted) {
      const pulse = 1 + Math.sin(state.clock.elapsedTime * (cascadeDepth === 0 ? 5.2 : 3.2)) * 0.14;
      haloRef.current.scale.setScalar(pulse);
    }
  });

  return (
    <group position={position} scale={style.scale}>
      <mesh
        ref={meshRef}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(node.id);
        }}
        onPointerOver={() => {
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'auto';
        }}
      >
        <AssetGeometry kind={kind} />
        <meshStandardMaterial
          color={style.baseColor}
          emissive={style.emissive}
          emissiveIntensity={style.emissiveIntensity}
          roughness={0.28}
          metalness={0.78}
        />
      </mesh>

      {style.ringColor ? (
        <mesh ref={haloRef} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.52, 0.022, 10, 36]} />
          <meshBasicMaterial color={style.ringColor} transparent opacity={0.85} />
        </mesh>
      ) : null}

      {showHtmlLabel ? (
        <Html position={[0, 0.56, 0]} center distanceFactor={9} zIndexRange={[10, 0]}>
          <button
            type="button"
            onClick={() => onSelect(node.id)}
            className={`whitespace-nowrap rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider shadow-md transition-colors ${
              cascadeDepth === 0
                ? 'border-red-400/80 bg-red-950/90 text-red-100'
                : cascadeDepth !== undefined
                  ? 'border-amber-400/80 bg-amber-950/90 text-amber-100'
                  : isSelected
                    ? 'border-sky-400 bg-blue-950/95 text-sky-100'
                    : 'border-slate-600/80 bg-slate-950/85 text-slate-200'
            }`}
          >
            {node.assetTag}
            {cascadeDepth !== undefined && cascadeDepth > 0 ? ` +${cascadeDepth}` : ''}
          </button>
        </Html>
      ) : null}
    </group>
  );
}

function PulseTravelOrb({
  from,
  to,
  color,
}: {
  from: TopologyPosition3D;
  to: TopologyPosition3D;
  color: string;
}) {
  const orbRef = React.useRef<THREE.Mesh>(null);
  const offset = React.useMemo(() => Math.random(), []);

  useFrame((state) => {
    if (!orbRef.current) return;
    const t = (state.clock.elapsedTime * 0.85 + offset) % 1;
    orbRef.current.position.set(
      from[0] + (to[0] - from[0]) * t,
      from[1] + (to[1] - from[1]) * t,
      from[2] + (to[2] - from[2]) * t,
    );
  });

  return (
    <mesh ref={orbRef}>
      <sphereGeometry args={[0.07, 10, 10]} />
      <meshBasicMaterial color={color} />
    </mesh>
  );
}

function AssetEdgeMesh({
  edge,
  from,
  to,
  isImpacted,
  isRootOrigin,
  reducedMotion,
}: {
  edge: TopologyEdge;
  from: TopologyPosition3D;
  to: TopologyPosition3D;
  isImpacted: boolean;
  isRootOrigin: boolean;
  reducedMotion: boolean;
}) {
  const lineColor = isRootOrigin ? '#EF4444' : isImpacted ? '#F59E0B' : '#38BDF8';
  const lineWidth = isImpacted ? 2.2 : 1.15;

  return (
    <group>
      <Line
        points={[from, to]}
        color={lineColor}
        lineWidth={lineWidth}
        transparent
        opacity={isImpacted ? 0.92 : edge.relationType === 'CONNECTS_TO' ? 0.42 : 0.34}
      />
      {isImpacted && !reducedMotion ? (
        <PulseTravelOrb from={to} to={from} color={isRootOrigin ? '#FCA5A5' : '#FDE68A'} />
      ) : null}
    </group>
  );
}

export function CmdbTopologyCanvas({
  nodes,
  edges,
  positions,
  cascade,
  selectedNodeId,
  onSelectNode,
  reducedMotion,
}: {
  nodes: readonly TopologyAssetNode[];
  edges: readonly TopologyEdge[];
  positions: Record<string, TopologyPosition3D>;
  cascade: CascadeAnalysisResult;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  reducedMotion: boolean;
}) {
  const impactedEdgeSet = React.useMemo(
    () => new Set(cascade.impactedEdgeIds),
    [cascade.impactedEdgeIds],
  );
  const rootFailSet = React.useMemo(
    () => new Set(cascade.failedRootIds),
    [cascade.failedRootIds],
  );

  React.useEffect(() => {
    return () => {
      document.body.style.cursor = 'auto';
    };
  }, []);

  const showAllLabels = nodes.length <= 16;

  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [5.6, 4.2, 6.8], fov: 42 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      onPointerMissed={() => onSelectNode(null)}
    >
      <ambientLight intensity={0.65} />
      <directionalLight position={[6, 10, 6]} intensity={1.55} color="#BAE6FD" />
      <pointLight position={[-6, -4, -4]} intensity={0.9} color="#3B82F6" />

      <gridHelper args={[14, 14, '#1E3A8A', '#0F172A']} position={[0, -2.8, 0]} />

      {edges.map((edge) => {
        const from = positions[edge.sourceId];
        const to = positions[edge.targetId];
        if (!from || !to) return null;
        const isImpacted = impactedEdgeSet.has(edge.id);
        const isRootOrigin = rootFailSet.has(edge.targetId) || (edge.relationType === 'CONNECTS_TO' && rootFailSet.has(edge.sourceId));
        return (
          <AssetEdgeMesh
            key={edge.id}
            edge={edge}
            from={from}
            to={to}
            isImpacted={isImpacted}
            isRootOrigin={isRootOrigin}
            reducedMotion={reducedMotion}
          />
        );
      })}

      {nodes.map((node) => {
        const position = positions[node.id];
        if (!position) return null;
        const depth = cascade.depthByNodeId[node.id];
        const isSelected = selectedNodeId === node.id;
        return (
          <AssetTopologyMesh
            key={node.id}
            node={node}
            position={position}
            cascadeDepth={depth}
            isSelected={isSelected}
            showHtmlLabel={showAllLabels || isSelected || depth !== undefined}
            reducedMotion={reducedMotion}
            onSelect={(id) => onSelectNode(id)}
          />
        );
      })}

      <OrbitControls
        enableDamping
        dampingFactor={0.07}
        minDistance={3.2}
        maxDistance={18}
        maxPolarAngle={Math.PI * 0.78}
      />
    </Canvas>
  );
}
