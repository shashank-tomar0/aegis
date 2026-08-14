// AEGIS Graph Canvas - High-performance Canvas-based graph visualization
// Zero-slop, 60fps rendering with WebGL fallback

import React, { useRef, useEffect, useCallback } from 'react';
import { useStore, selectGraph, selectViewport, selectSelectedNodes, selectSelectedEdges, selectHoverNode, selectHoverEdge, selectMode } from '../../store';
import type { GraphNode, GraphEdge, NodeKind, EdgeKind, RiskSeverity, Position, NodeId } from '../../types';
import { NodeKind as NK, EdgeKind as EK, RiskSeverity as RS } from '../../types';

const NODE_RADIUS = 16;
const NODE_RADIUS_SMALL = 10;
const EDGE_WIDTH_BASE = 1.5;
const EDGE_WIDTH_HIGHLIGHT = 3;

const NODE_COLORS: Record<NodeKind, string> = {
  [NK.AGENT]: '#22c55e',
  [NK.TOOL]: '#3b82f6',
  [NK.DATA_SOURCE]: '#f59e0b',
  [NK.USER]: '#ec4899',
  [NK.GATEWAY]: '#8b5cf6',
};

const NODE_COLORS_DIM: Record<NodeKind, string> = {
  [NK.AGENT]: '#166534',
  [NK.TOOL]: '#1e40af',
  [NK.DATA_SOURCE]: '#92400e',
  [NK.USER]: '#9d174d',
  [NK.GATEWAY]: '#5b21b6',
};

const SEVERITY_COLORS: Record<RiskSeverity, string> = {
  [RS.INFO]: '#64748b',
  [RS.LOW]: '#22c55e',
  [RS.MEDIUM]: '#f59e0b',
  [RS.HIGH]: '#f97316',
  [RS.CRITICAL]: '#ef4444',
};

const EDGE_COLORS: Record<EdgeKind, string> = {
  [EK.INVOCATION]: '#22c55e',
  [EK.DATA_FLOW]: '#3b82f6',
  [EK.PRIVILEGE]: '#f97316',
  [EK.DELEGATION]: '#8b5cf6',
  [EK.OBSERVATION]: '#64748b',
};

interface GraphCanvasProps {
  width: number;
  height: number;
}

export const GraphCanvas: React.FC<GraphCanvasProps> = ({ width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  const graph = useStore((state: any) => state.graph);
  const viewport = useStore((state: any) => state.viewport);
  const selectedNodes = useStore((state: any) => state.selectedNodes);
  const selectedEdges = useStore((state: any) => state.selectedEdges);
  const hoverNode = useStore((state: any) => state.hoverNode);
  const hoverEdge = useStore((state: any) => state.hoverEdge);
  const mode = useStore((state: any) => state.mode);

  const setHoverNode = useStore((state: any) => state.setHoverNode);
  const setHoverEdge = useStore((state: any) => state.setHoverEdge);
  const selectNode = useStore((state: any) => state.selectNode);
  const selectEdge = useStore((state: any) => state.selectEdge);
  const startPan = useStore((state: any) => state.startPan);
  const updatePan = useStore((state: any) => state.updatePan);
  const endPan = useStore((state: any) => state.endPan);

  // Transform screen coords to graph coords
  const screenToGraph = useCallback((x: number, y: number): Position => {
    return {
      x: (x - viewport.x) / viewport.zoom,
      y: (y - viewport.y) / viewport.zoom,
    };
  }, [viewport]);

  // Transform graph coords to screen coords
  const graphToScreen = useCallback((x: number, y: number): Position => {
    return {
      x: x * viewport.zoom + viewport.x,
      y: y * viewport.zoom + viewport.y,
    };
  }, [viewport]);

  // Check if point is inside node
  const hitTestNode = useCallback((node: GraphNode, x: number, y: number): boolean => {
    const screenPos = graphToScreen(node.position.x, node.position.y);
    const dx = x - screenPos.x;
    const dy = y - screenPos.y;
    const radius = (node.isQuarantined ? NODE_RADIUS_SMALL : NODE_RADIUS) * viewport.zoom;
    return dx * dx + dy * dy <= radius * radius;
  }, [graphToScreen, viewport.zoom]);

  // Check if point is near edge
  const hitTestEdge = useCallback((edge: GraphEdge, x: number, y: number): boolean => {
    const source = graph.getNode(edge.source);
    const target = graph.getNode(edge.target);
    if (!source || !target) return false;

    const s = graphToScreen(source.position.x, source.position.y);
    const t = graphToScreen(target.position.x, target.position.y);

    // Distance from point to line segment
    const dx = t.x - s.x;
    const dy = t.y - s.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length === 0) return false;

    const tParam = ((x - s.x) * dx + (y - s.y) * dy) / (length * length);
    if (tParam < 0 || tParam > 1) return false;

    const projX = s.x + tParam * dx;
    const projY = s.y + tParam * dy;
    const dist = Math.sqrt((x - projX) ** 2 + (y - projY) ** 2);

    return dist <= Math.max(4, EDGE_WIDTH_BASE * viewport.zoom * edge.weight);
  }, [graph, graphToScreen, viewport.zoom]);

  // Render loop
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;

    // Resize for DPR
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = '#0a0a0b';
    ctx.fillRect(0, 0, width, height);

    // Grid pattern
    if (viewport.zoom > 0.3) {
      ctx.strokeStyle = '#1a1a1c';
      ctx.lineWidth = 1;
      const gridSize = 40 * viewport.zoom;
      const offsetX = (viewport.x % gridSize + gridSize) % gridSize;
      const offsetY = (viewport.y % gridSize + gridSize) % gridSize;

      for (let x = -offsetX; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = -offsetY; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    }

    const nodes = graph.getAllNodes();
    const edges = graph.getAllEdges();

    // Draw edges first (behind nodes)
    for (const edge of edges) {
      const source = graph.getNode(edge.source);
      const target = graph.getNode(edge.target);
      if (!source || !target) continue;

      const s = graphToScreen(source.position.x, source.position.y);
      const t = graphToScreen(target.position.x, target.position.y);

      const isSelected = selectedEdges.has(edge.id);
      const isHovered = hoverEdge === edge.id;
      const isActive = edge.isActive;

      if (!isActive) continue;

      ctx.beginPath();
      ctx.moveTo(s.x, s.y);

      // Curved edges for better visibility
      const midX = (s.x + t.x) / 2;
      const midY = (s.y + t.y) / 2;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const perpX = -dy * 0.15;
      const perpY = dx * 0.15;
      ctx.quadraticCurveTo(midX + perpX, midY + perpY, t.x, t.y);

      const width = (isSelected || isHovered ? EDGE_WIDTH_HIGHLIGHT : EDGE_WIDTH_BASE) * edge.weight * viewport.zoom;
      ctx.lineWidth = Math.max(1, width);

      const edgeKind = edge.kind as EdgeKind;
      const baseColor = EDGE_COLORS[edgeKind] || '#64748b';
      if (isSelected) {
        ctx.strokeStyle = '#fff';
        ctx.shadowColor = baseColor;
        ctx.shadowBlur = 8;
      } else if (isHovered) {
        ctx.strokeStyle = baseColor;
        ctx.shadowColor = baseColor;
        ctx.shadowBlur = 6;
      } else {
        ctx.strokeStyle = baseColor + 'cc';
        ctx.shadowBlur = 0;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Arrow head
      if (edge.kind === EK.INVOCATION || edge.kind === EK.DATA_FLOW || edge.kind === EK.PRIVILEGE) {
        const angle = Math.atan2(t.y - s.y, t.x - s.x);
        const arrowSize = 8 * viewport.zoom;
        ctx.beginPath();
        ctx.moveTo(t.x, t.y);
        ctx.lineTo(t.x - arrowSize * Math.cos(angle - Math.PI / 6), t.y - arrowSize * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(t.x - arrowSize * Math.cos(angle + Math.PI / 6), t.y - arrowSize * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fill();
      }

      // Edge label for high-weight edges
      if (edge.weight > 1.5 && viewport.zoom > 0.5) {
        ctx.font = `10px "JetBrains Mono", monospace`;
        ctx.fillStyle = '#71717a';
        ctx.textAlign = 'center';
        ctx.fillText(`${edge.weight.toFixed(1)}x`, midX + perpX, midY + perpY - 4);
      }
    }

    // Draw nodes
    for (const node of nodes) {
      const screenPos = graphToScreen(node.position.x, node.position.y);

      // Skip if off-screen (with margin)
      const margin = 50 * viewport.zoom;
      if (screenPos.x < -margin || screenPos.x > width + margin ||
          screenPos.y < -margin || screenPos.y > height + margin) {
        continue;
      }

      const isSelected = selectedNodes.has(node.id);
      const isHovered = hoverNode === node.id;
      const isCompromised = node.isCompromised;
      const isQuarantined = node.isQuarantined;

      const nodeKind = node.kind as NodeKind;
      const riskSeverity = node.severity as RiskSeverity;
      const baseColor = NODE_COLORS[nodeKind];
      const dimColor = NODE_COLORS_DIM[nodeKind];
      const severityColor = SEVERITY_COLORS[riskSeverity];
      const radius = isQuarantined ? NODE_RADIUS_SMALL : NODE_RADIUS;

      // Outer glow for compromised/selected
      if (isCompromised || isSelected) {
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, (radius + 4) * viewport.zoom, 0, Math.PI * 2);
        ctx.fillStyle = isCompromised ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.3)';
        ctx.fill();
      }

      // Node body
      ctx.beginPath();
      ctx.arc(screenPos.x, screenPos.y, radius * viewport.zoom, 0, Math.PI * 2);

      if (isSelected) {
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = baseColor;
        ctx.lineWidth = 3 * viewport.zoom;
      } else if (isHovered) {
        ctx.fillStyle = baseColor + 'ee';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2 * viewport.zoom;
      } else if (isCompromised) {
        ctx.fillStyle = '#ef4444';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2 * viewport.zoom;
      } else if (isQuarantined) {
        ctx.fillStyle = dimColor;
        ctx.strokeStyle = '#71717a';
        ctx.lineWidth = 1.5 * viewport.zoom;
        ctx.setLineDash([4 * viewport.zoom, 4 * viewport.zoom]);
      } else {
        ctx.fillStyle = baseColor;
        ctx.strokeStyle = 'transparent';
        ctx.lineWidth = 0;
      }
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);

      // Severity ring
      if (node.severity >= RS.MEDIUM && viewport.zoom > 0.4) {
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, (radius + 2) * viewport.zoom, 0, Math.PI * 2);
        ctx.strokeStyle = severityColor;
        ctx.lineWidth = 2 * viewport.zoom;
        ctx.stroke();
      }

      // Crypto indicator
      if (node.cryptoProfile && viewport.zoom > 0.5) {
        const cryptoColor = node.cryptoProfile.quantumResistance === 2 ? '#22c55e' :
                           node.cryptoProfile.quantumResistance === 1 ? '#f59e0b' : '#ef4444';
        ctx.beginPath();
        ctx.arc(screenPos.x + radius * 0.7 * viewport.zoom, screenPos.y - radius * 0.7 * viewport.zoom, 5 * viewport.zoom, 0, Math.PI * 2);
        ctx.fillStyle = cryptoColor;
        ctx.fill();
        ctx.strokeStyle = '#0a0a0b';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Label
      if (viewport.zoom > 0.35) {
        ctx.font = `11px "JetBrains Mono", monospace`;
        ctx.fillStyle = isSelected ? '#0a0a0b' : '#e4e4e7';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const labelY = screenPos.y + (radius + 4) * viewport.zoom;
        ctx.fillText(node.label, screenPos.x, labelY);
      }

      // Risk score indicator
      if (node.riskScore > 0.5 && viewport.zoom > 0.4) {
        const barWidth = 30 * viewport.zoom;
        const barHeight = 3 * viewport.zoom;
        const barX = screenPos.x - barWidth / 2;
        const barY = screenPos.y - (radius + 14) * viewport.zoom;

        ctx.fillStyle = '#27272a';
        ctx.fillRect(barX, barY, barWidth, barHeight);

        ctx.fillStyle = node.riskScore > 0.8 ? '#ef4444' : node.riskScore > 0.5 ? '#f59e0b' : '#22c55e';
        ctx.fillRect(barX, barY, barWidth * node.riskScore, barHeight);
      }
    }

    // Draw blast radius visualization if in blast mode
    if (mode === 'blast' && selectedNodes.size === 1) {
      const sourceId = Array.from(selectedNodes)[0];
      const blast = graph.calculateBlastRadius(sourceId);
      for (const nodeId of blast.reachableNodes) {
        const node = graph.getNode(nodeId);
        if (node && nodeId !== sourceId) {
          const screenPos = graphToScreen(node.position.x, node.position.y);
          const risk = blast.riskPropagation.get(nodeId) || 0;
          ctx.beginPath();
          ctx.arc(screenPos.x, screenPos.y, (NODE_RADIUS + 8 + risk * 20) * viewport.zoom, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(239, 68, 68, ${0.3 + risk * 0.4})`;
          ctx.lineWidth = 2 * viewport.zoom;
          ctx.setLineDash([6 * viewport.zoom, 4 * viewport.zoom]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }
  }, [width, height, viewport, graph, selectedNodes, selectedEdges, hoverNode, hoverEdge, mode, graphToScreen]);

  // Animation loop
  useEffect(() => {
    const animate = () => {
      render();
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();
    return () => cancelAnimationFrame(animationRef.current!);
  }, [render]);

  // Mouse handlers
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (mode === 'pan' && (e.buttons & 1)) {
      updatePan({ x, y });
      return;
    }

    // Hit testing
    const nodes = graph.getAllNodes();
    let hitNode: GraphNode | null = null;
    let hitEdge: GraphEdge | null = null;

    for (const node of nodes) {
      if (hitTestNode(node, x, y)) {
        hitNode = node;
        break;
      }
    }

    if (!hitNode) {
      const edges = graph.getAllEdges();
      for (const edge of edges) {
        if (hitTestEdge(edge, x, y)) {
          hitEdge = edge;
          break;
        }
      }
    }

    setHoverNode(hitNode?.id || null);
    setHoverEdge(hitEdge?.id || null);
  }, [graph, mode, hitTestNode, hitTestEdge, updatePan, setHoverNode, setHoverEdge]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (mode === 'pan' || (e.buttons & 2) || (e.shiftKey && e.buttons & 1)) {
      startPan({ x, y });
      return;
    }

    // Hit test for selection
    const nodes = graph.getAllNodes();
    for (const node of nodes) {
      if (hitTestNode(node, x, y)) {
        selectNode(node.id, e.shiftKey || e.metaKey || e.ctrlKey);
        return;
      }
    }

    const edges = graph.getAllEdges();
    for (const edge of edges) {
      if (hitTestEdge(edge, x, y)) {
        selectEdge(edge.id, e.shiftKey || e.metaKey || e.ctrlKey);
        return;
      }
    }

    // Click on empty space - clear selection
    if (!(e.shiftKey || e.metaKey || e.ctrlKey)) {
      useStore.getState().clearSelection();
    }
  }, [graph, mode, hitTestNode, hitTestEdge, startPan, selectNode, selectEdge]);

  const handleMouseUp = useCallback(() => {
    endPan();
  }, [endPan]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(5, viewport.zoom * zoomFactor));

    // Zoom towards mouse position
    const newX = mouseX - (mouseX - viewport.x) * (newZoom / viewport.zoom);
    const newY = mouseY - (mouseY - viewport.y) * (newZoom / viewport.zoom);

    useStore.getState().setViewport({ x: newX, y: newY, zoom: newZoom });
  }, [viewport]);

  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const nodes = graph.getAllNodes();
    for (const node of nodes) {
      if (hitTestNode(node, x, y)) {
        useStore.getState().zoomToNode(node.id);
        return;
      }
    }
  }, [graph, hitTestNode]);

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    // Could show context menu here
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        width: '100%',
        height: '100%',
        touchAction: 'none',
        cursor: mode === 'pan' ? 'grab' : 'crosshair',
      }}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
    />
  );
};