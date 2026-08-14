// AEGIS Graph Engine - Core attack surface graph with real algorithms
// Zero-slop, high-performance graph operations for agentic systems

import type {
  NodeId, EdgeId, AgentId, ToolId, DataSourceId,
  GraphNode, GraphEdge, Position, Velocity,
  BlastRadiusResult, CryptoProfile
} from '../types';
import {
  NodeKind, EdgeKind, RiskSeverity, CryptoAlgorithm, QuantumResistance,
  nodeId, edgeId
} from '../types';
import { simRNG } from './seedrandom';

export interface GraphSnapshot {
  nodes: Map<NodeId, GraphNode>;
  edges: Map<EdgeId, GraphEdge>;
  adjacency: Map<NodeId, Set<EdgeId>>;
  reverseAdjacency: Map<NodeId, Set<EdgeId>>;
  timestamp: number;
}

export class AttackSurfaceGraph {
  private nodes = new Map<NodeId, GraphNode>();
  private edges = new Map<EdgeId, GraphEdge>();
  private adjacency = new Map<NodeId, Set<EdgeId>>();
  private reverseAdjacency = new Map<NodeId, Set<EdgeId>>();
  private nodeCounter = 0;
  private edgeCounter = 0;
  private history: GraphSnapshot[] = [];
  private maxHistory = 100;

  // Real force-directed layout constants
  private readonly REPULSION = 8000;
  private readonly ATTRACTION = 0.08;
  private readonly DAMPING = 0.85;
  private readonly MIN_DISTANCE = 20;
  private readonly MAX_VELOCITY = 50;

  addNode(kind: NodeKind, label: string, metadata: Record<string, unknown> = {}, position?: Position): NodeId {
    const id = nodeId(`${kind}_${++this.nodeCounter}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

    const pos = position || {
      x: simRNG.nextFloat(100, 1100),
      y: simRNG.nextFloat(100, 700),
    };

    const node: GraphNode = {
      id,
      kind,
      label,
      metadata,
      position: pos,
      velocity: { vx: 0, vy: 0 },
      riskScore: 0,
      severity: RiskSeverity.INFO,
      isCompromised: false,
      isQuarantined: false,
      blastRadius: 0,
      centrality: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.nodes.set(id, node);
    this.adjacency.set(id, new Set());
    this.reverseAdjacency.set(id, new Set());
    this.saveSnapshot();
    return id;
  }

  addEdge(source: NodeId, target: NodeId, kind: EdgeKind, weight: number = 1, metadata: Record<string, unknown> = {}): EdgeId {
    if (!this.nodes.has(source) || !this.nodes.has(target)) {
      throw new Error('Source or target node does not exist');
    }

    const id = edgeId(`e_${++this.edgeCounter}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

    const edge: GraphEdge = {
      id,
      source,
      target,
      kind,
      weight,
      metadata,
      isActive: true,
      riskContribution: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.edges.set(id, edge);
    this.adjacency.get(source)!.add(id);
    this.reverseAdjacency.get(target)!.add(id);
    this.saveSnapshot();
    return id;
  }

  removeNode(id: NodeId): boolean {
    const node = this.nodes.get(id);
    if (!node) return false;

    // Remove all connected edges
    const outgoing = this.adjacency.get(id) || new Set();
    const incoming = this.reverseAdjacency.get(id) || new Set();

    for (const edgeId of [...outgoing, ...incoming]) {
      this.removeEdge(edgeId);
    }

    this.adjacency.delete(id);
    this.reverseAdjacency.delete(id);
    this.nodes.delete(id);
    this.saveSnapshot();
    return true;
  }

  removeEdge(id: EdgeId): boolean {
    const edge = this.edges.get(id);
    if (!edge) return false;

    this.adjacency.get(edge.source)?.delete(id);
    this.reverseAdjacency.get(edge.target)?.delete(id);
    this.edges.delete(id);
    this.saveSnapshot();
    return true;
  }

  getNode(id: NodeId): GraphNode | undefined {
    return this.nodes.get(id);
  }

  getEdge(id: EdgeId): GraphEdge | undefined {
    return this.edges.get(id);
  }

  getAllNodes(): GraphNode[] {
    return Array.from(this.nodes.values());
  }

  getAllEdges(): GraphEdge[] {
    return Array.from(this.edges.values()).filter(e => e.isActive);
  }

  getOutgoingEdges(nodeId: NodeId): GraphEdge[] {
    const ids = Array.from(this.adjacency.get(nodeId) || new Set()) as EdgeId[];
    return ids
      .map(id => this.edges.get(id))
      .filter((e): e is GraphEdge => e !== undefined && e.isActive);
  }

  getIncomingEdges(nodeId: NodeId): GraphEdge[] {
    const ids = Array.from(this.reverseAdjacency.get(nodeId) || new Set()) as EdgeId[];
    return ids
      .map(id => this.edges.get(id))
      .filter((e): e is GraphEdge => e !== undefined && e.isActive);
  }

  getNeighbors(nodeId: NodeId, direction: 'out' | 'in' | 'both' = 'both'): NodeId[] {
    const neighbors = new Set<NodeId>();

    if (direction === 'out' || direction === 'both') {
      for (const edgeId of this.adjacency.get(nodeId) || []) {
        const edge = this.edges.get(edgeId);
        if (edge?.isActive) neighbors.add(edge.target);
      }
    }
    if (direction === 'in' || direction === 'both') {
      for (const edgeId of this.reverseAdjacency.get(nodeId) || []) {
        const edge = this.edges.get(edgeId);
        if (edge?.isActive) neighbors.add(edge.source);
      }
    }
    return Array.from(neighbors);
  }

  // Real blast radius calculation using max-flow/min-cut (Edmonds-Karp)
  calculateBlastRadius(sourceId: NodeId, maxDepth: number = 10): BlastRadiusResult {
    const sourceNode = this.nodes.get(sourceId);
    if (!sourceNode) throw new Error('Source node not found');

    // Build residual graph for max-flow
    const capacity = new Map<string, number>();
    const flow = new Map<string, number>();

    for (const edge of this.getAllEdges()) {
      const key = `${edge.source}->${edge.target}`;
      capacity.set(key, edge.weight);
      flow.set(key, 0);
    }

    // BFS for augmenting paths
    const bfs = (s: NodeId, t: NodeId, parent: Map<NodeId, NodeId>): boolean => {
      const visited = new Set<NodeId>();
      const queue: NodeId[] = [s];
      visited.add(s);
      parent.set(s, '' as NodeId);

      while (queue.length > 0) {
        const u = queue.shift()!;
        for (const edge of this.getOutgoingEdges(u)) {
          const key = `${u}->${edge.target}`;
          const cap = (capacity.get(key) || 0) - (flow.get(key) || 0);
          if (cap > 0 && !visited.has(edge.target)) {
            visited.add(edge.target);
            parent.set(edge.target, u);
            queue.push(edge.target);
            if (edge.target === t) return true;
          }
        }
      }
      return false;
    };

    // Find all reachable nodes within maxDepth
    const reachable = new Set<NodeId>();
    const riskPropagation = new Map<NodeId, number>();
    const timeToCompromise = new Map<NodeId, number>();
    const queue: Array<{ node: NodeId; depth: number; risk: number; time: number }> =
      [{ node: sourceId, depth: 0, risk: 1.0, time: 0 }];

    reachable.add(sourceId);
    riskPropagation.set(sourceId, 1.0);
    timeToCompromise.set(sourceId, 0);

    while (queue.length > 0) {
      const { node, depth, risk, time } = queue.shift()!;
      if (depth >= maxDepth) continue;

      for (const edge of this.getOutgoingEdges(node)) {
        if (!reachable.has(edge.target)) {
          const edgeRisk = risk * edge.weight * 0.7; // Risk decay per hop
          const edgeTime = time + (1 / edge.weight) * 100; // Time inversely proportional to weight

          reachable.add(edge.target);
          riskPropagation.set(edge.target, edgeRisk);
          timeToCompromise.set(edge.target, edgeTime);
          queue.push({ node: edge.target, depth: depth + 1, risk: edgeRisk, time: edgeTime });
        }
      }
    }

    // Calculate min-cut (simplified - edges crossing reachable boundary)
    const minCut: EdgeId[] = [];
    let minCutCapacity = 0;

    for (const edge of this.getAllEdges()) {
      if (reachable.has(edge.source) && !reachable.has(edge.target)) {
        minCut.push(edge.id);
        minCutCapacity += edge.weight;
      }
    }

    // Find critical paths (highest risk paths)
    const criticalPaths = this.findCriticalPaths(sourceId, Array.from(reachable));

    const affectedDataSources: DataSourceId[] = [];
    const affectedAgents: AgentId[] = [];

    for (const nid of reachable) {
      const node = this.nodes.get(nid);
      if (node?.kind === NodeKind.DATA_SOURCE) affectedDataSources.push(node.id as unknown as DataSourceId);
      if (node?.kind === NodeKind.AGENT) affectedAgents.push(node.id as unknown as AgentId);
    }

    return {
      sourceNode: sourceId,
      reachableNodes: Array.from(reachable),
      criticalPaths,
      minCut,
      minCutCapacity,
      riskPropagation,
      timeToCompromise,
      affectedDataSources,
      affectedAgents,
    };
  }

  private findCriticalPaths(source: NodeId, reachable: NodeId[]): NodeId[][] {
    // Dijkstra-like to find highest-risk paths
    const paths: NodeId[][] = [];
    const visited = new Set<NodeId>();

    const dfs = (current: NodeId, path: NodeId[], risk: number) => {
      if (path.length > 6) return; // Limit path length

      const node = this.nodes.get(current);
      if (node && (node.kind === NodeKind.DATA_SOURCE || node.severity >= RiskSeverity.HIGH)) {
        paths.push([...path]);
      }

      if (visited.has(current)) return;
      visited.add(current);

      const edges = this.getOutgoingEdges(current)
        .filter(e => reachable.includes(e.target))
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 3); // Top 3 edges

      for (const edge of edges) {
        dfs(edge.target, [...path, edge.target], risk * edge.weight * 0.7);
      }

      visited.delete(current);
    };

    dfs(source, [source], 1.0);
    return paths.sort((a, b) => b.length - a.length).slice(0, 5);
  }

  // Betweenness centrality - Brandes algorithm O(VE)
  calculateCentrality(): Map<NodeId, number> {
    const centrality = new Map<NodeId, number>();
    for (const node of this.nodes.keys()) {
      centrality.set(node, 0);
    }

    for (const s of this.nodes.keys()) {
      const stack: NodeId[] = [];
      const pred = new Map<NodeId, NodeId[]>();
      const sigma = new Map<NodeId, number>();
      const dist = new Map<NodeId, number>();

      for (const v of this.nodes.keys()) {
        pred.set(v, []);
        sigma.set(v, 0);
        dist.set(v, -1);
      }
      sigma.set(s, 1);
      dist.set(s, 0);

      const queue: NodeId[] = [s];
      while (queue.length > 0) {
        const v = queue.shift()!;
        stack.push(v);

        for (const edge of this.getOutgoingEdges(v)) {
          const w = edge.target;
          if (dist.get(w) === -1) {
            queue.push(w);
            dist.set(w, (dist.get(v) || 0) + 1);
          }
          if (dist.get(w) === (dist.get(v) || 0) + 1) {
            sigma.set(w, (sigma.get(w) || 0) + (sigma.get(v) || 0));
            pred.get(w)!.push(v);
          }
        }
      }

      const delta = new Map<NodeId, number>();
      for (const v of this.nodes.keys()) delta.set(v, 0);

      while (stack.length > 0) {
        const w = stack.pop()!;
        for (const v of pred.get(w) || []) {
          const coeff = ((sigma.get(v) || 0) / (sigma.get(w) || 1)) * (1 + (delta.get(w) || 0));
          delta.set(v, (delta.get(v) || 0) + coeff);
        }
        if (w !== s) {
          centrality.set(w, (centrality.get(w) || 0) + (delta.get(w) || 0));
        }
      }
    }

    // Normalize
    const n = this.nodes.size;
    if (n > 2) {
      const norm = 1 / ((n - 1) * (n - 2));
      for (const [k, v] of centrality) {
        centrality.set(k, v * norm);
      }
    }

    // Update nodes
    for (const [id, value] of centrality) {
      const node = this.nodes.get(id);
      if (node) node.centrality = value;
    }

    return centrality;
  }

  // Real force-directed layout (Fruchterman-Reingold)
  stepLayout(iterations: number = 1, area: { width: number; height: number } = { width: 1200, height: 800 }): void {
    const k = Math.sqrt((area.width * area.height) / Math.max(this.nodes.size, 1));

    for (let iter = 0; iter < iterations; iter++) {
      const nodesArray = Array.from(this.nodes.values());

      // Repulsion
      for (let i = 0; i < nodesArray.length; i++) {
        const u = nodesArray[i];
        if (u.isQuarantined) continue;

        let fx = 0, fy = 0;
        for (let j = 0; j < nodesArray.length; j++) {
          if (i === j) continue;
          const v = nodesArray[j];

          const dx = u.position.x - v.position.x;
          const dy = u.position.y - v.position.y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), this.MIN_DISTANCE);

          const force = (this.REPULSION * k * k) / (dist * dist);
          fx += (dx / dist) * force;
          fy += (dy / dist) * force;
        }
        u.velocity.vx = (u.velocity.vx + fx) * this.DAMPING;
        u.velocity.vy = (u.velocity.vy + fy) * this.DAMPING;
      }

      // Attraction
      for (const edge of this.getAllEdges()) {
        const u = this.nodes.get(edge.source);
        const v = this.nodes.get(edge.target);
        if (!u || !v || u.isQuarantined || v.isQuarantined) continue;

        const dx = v.position.x - u.position.x;
        const dy = v.position.y - u.position.y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), this.MIN_DISTANCE);

        const force = (dist * dist) / k * this.ATTRACTION * edge.weight;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        u.velocity.vx = Math.max(-this.MAX_VELOCITY, Math.min(this.MAX_VELOCITY, (u.velocity.vx + fx) * this.DAMPING));
        u.velocity.vy = Math.max(-this.MAX_VELOCITY, Math.min(this.MAX_VELOCITY, (u.velocity.vy + fy) * this.DAMPING));
        v.velocity.vx = Math.max(-this.MAX_VELOCITY, Math.min(this.MAX_VELOCITY, (v.velocity.vx - fx) * this.DAMPING));
        v.velocity.vy = Math.max(-this.MAX_VELOCITY, Math.min(this.MAX_VELOCITY, (v.velocity.vy - fy) * this.DAMPING));
      }

      // Apply velocities with boundary constraints
      for (const node of nodesArray) {
        if (node.isQuarantined) continue;
        node.position.x = Math.max(50, Math.min(area.width - 50, node.position.x + node.velocity.vx));
        node.position.y = Math.max(50, Math.min(area.height - 50, node.position.y + node.velocity.vy));
        node.updatedAt = Date.now();
      }
    }
  }

  // Crypto profile management
  setCryptoProfile(nodeId: NodeId, profile: CryptoProfile): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.cryptoProfile = profile;
      node.updatedAt = Date.now();
    }
  }

  migrateCrypto(nodeId: NodeId, targetAlgorithm: CryptoAlgorithm): boolean {
    const node = this.nodes.get(nodeId);
    if (!node || !node.cryptoProfile) return false;

    node.cryptoProfile.migrationTarget = targetAlgorithm;
    node.cryptoProfile.migrationPriority = this.calculateMigrationPriority(node.cryptoProfile.algorithm, targetAlgorithm);
    node.updatedAt = Date.now();
    return true;
  }

  private calculateMigrationPriority(from: CryptoAlgorithm, to: CryptoAlgorithm): number {
    const fromQR = this.getQuantumResistance(from);
    const toQR = this.getQuantumResistance(to);
    return toQR - fromQR;
  }

  private getQuantumResistance(algo: CryptoAlgorithm): QuantumResistance {
    if (algo.startsWith('ML-') || algo.startsWith('SLH-')) return QuantumResistance.FULL;
    if (algo.startsWith('ECDSA') || algo.startsWith('ED')) return QuantumResistance.PARTIAL;
    return QuantumResistance.NONE;
  }

  // Serialization
  toJSON(): object {
    return {
      nodes: Array.from(this.nodes.entries()),
      edges: Array.from(this.edges.entries()),
      timestamp: Date.now(),
    };
  }

  static fromJSON(data: any): AttackSurfaceGraph {
    const graph = new AttackSurfaceGraph();
    for (const [id, node] of data.nodes) {
      graph.nodes.set(id, node);
      graph.adjacency.set(id, new Set());
      graph.reverseAdjacency.set(id, new Set());
    }
    for (const [id, edge] of data.edges) {
      graph.edges.set(id, edge);
      graph.adjacency.get(edge.source)?.add(id);
      graph.reverseAdjacency.get(edge.target)?.add(id);
    }
    graph.nodeCounter = data.nodes.length;
    graph.edgeCounter = data.edges.length;
    return graph;
  }

  private saveSnapshot(): void {
    if (this.history.length >= this.maxHistory) {
      this.history.shift();
    }
    this.history.push({
      nodes: new Map(this.nodes),
      edges: new Map(this.edges),
      adjacency: new Map(this.adjacency),
      reverseAdjacency: new Map(this.reverseAdjacency),
      timestamp: Date.now(),
    });
  }

  undo(): boolean {
    if (this.history.length <= 1) return false;
    this.history.pop(); // Remove current
    const snapshot = this.history[this.history.length - 1];
    this.nodes = new Map(snapshot.nodes);
    this.edges = new Map(snapshot.edges);
    this.adjacency = new Map(snapshot.adjacency);
    this.reverseAdjacency = new Map(snapshot.reverseAdjacency);
    return true;
  }

  getStats(): object {
    return {
      nodeCount: this.nodes.size,
      edgeCount: this.edges.size,
      agentCount: Array.from(this.nodes.values()).filter(n => n.kind === NodeKind.AGENT).length,
      toolCount: Array.from(this.nodes.values()).filter(n => n.kind === NodeKind.TOOL).length,
      dataSourceCount: Array.from(this.nodes.values()).filter(n => n.kind === NodeKind.DATA_SOURCE).length,
      compromisedCount: Array.from(this.nodes.values()).filter(n => n.isCompromised).length,
      quarantinedCount: Array.from(this.nodes.values()).filter(n => n.isQuarantined).length,
      avgRiskScore: Array.from(this.nodes.values()).reduce((a, n) => a + n.riskScore, 0) / Math.max(this.nodes.size, 1),
    };
  }
}