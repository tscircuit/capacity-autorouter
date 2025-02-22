import { BaseSolver } from "../BaseSolver"
import type {
  CapacityMeshEdge,
  CapacityMeshNode,
  CapacityMeshNodeId,
  CapacityPath,
  SimpleRouteConnection,
  SimpleRouteJson,
} from "../../types"
import { getNodeEdgeMap } from "../CapacityMeshSolver/getNodeEdgeMap"
import { distance } from "@tscircuit/math-utils"
import { CapacityHyperParameters } from "../CapacityHyperParameters"
import { GraphicsObject } from "graphics-debug"
import { safeTransparentize } from "../colors"

export type Candidate = {
  prevCandidate: Candidate | null
  node: CapacityMeshNode
  f: number
  g: number
  h: number
}

export class CapacityPathingSolver extends BaseSolver {
  connectionsWithNodes: Array<{
    connection: SimpleRouteConnection
    nodes: CapacityMeshNode[]
    path?: CapacityMeshNode[]
  }>

  usedNodeCapacityMap: Map<CapacityMeshNodeId, number>

  simpleRouteJson: SimpleRouteJson
  nodes: CapacityMeshNode[]
  edges: CapacityMeshEdge[]
  GREEDY_MULTIPLIER = 10

  nodeMap: Map<CapacityMeshNodeId, CapacityMeshNode>
  nodeEdgeMap: Map<CapacityMeshNodeId, CapacityMeshEdge[]>
  colorMap: Record<string, string>
  maxDepthOfNodes: number

  activeCandidateStraightLineDistance?: number

  hyperParameters: Partial<CapacityHyperParameters>

  constructor({
    simpleRouteJson,
    nodes,
    edges,
    colorMap,
    MAX_ITERATIONS = 200_000,
    hyperParameters = {},
  }: {
    simpleRouteJson: SimpleRouteJson
    nodes: CapacityMeshNode[]
    edges: CapacityMeshEdge[]
    colorMap?: Record<string, string>
    MAX_ITERATIONS?: number
    hyperParameters?: Partial<CapacityHyperParameters>
  }) {
    super()
    this.MAX_ITERATIONS = MAX_ITERATIONS
    this.simpleRouteJson = simpleRouteJson
    this.nodes = nodes
    this.edges = edges
    this.colorMap = colorMap ?? {}
    this.connectionsWithNodes = this.getConnectionsWithNodes()
    this.hyperParameters = hyperParameters
    this.usedNodeCapacityMap = new Map(
      this.nodes.map((node) => [node.capacityMeshNodeId, 0]),
    )
    this.nodeMap = new Map(
      this.nodes.map((node) => [node.capacityMeshNodeId, node]),
    )
    this.nodeEdgeMap = getNodeEdgeMap(this.edges)
    this.maxDepthOfNodes = Math.max(
      ...this.nodes.map((node) => node._depth ?? 0),
    )
  }

  getTotalCapacity(node: CapacityMeshNode): number {
    const depth = node._depth ?? 0
    return (this.maxDepthOfNodes - depth + 1) ** 2
  }

  getConnectionsWithNodes() {
    const connectionsWithNodes: Array<{
      connection: SimpleRouteConnection
      nodes: CapacityMeshNode[]
      pathFound: boolean
    }> = []
    const nodesWithTargets = this.nodes.filter((node) => node._containsTarget)

    for (const connection of this.simpleRouteJson.connections) {
      const nodesForConnection: CapacityMeshNode[] = []
      for (const point of connection.pointsToConnect) {
        let closestNode = this.nodes[0]
        let minDistance = Number.MAX_VALUE

        for (const node of nodesWithTargets) {
          const distance = Math.sqrt(
            (node.center.x - point.x) ** 2 + (node.center.y - point.y) ** 2,
          )
          if (distance < minDistance) {
            minDistance = distance
            closestNode = node
          }
        }
        nodesForConnection.push(closestNode)
      }
      if (nodesForConnection.length < 2) {
        throw new Error(
          `Not enough nodes for connection "${connection.name}", only ${nodesForConnection.length} found`,
        )
      }
      connectionsWithNodes.push({
        connection,
        nodes: nodesForConnection,
        pathFound: false,
      })
    }
    return connectionsWithNodes
  }

  currentConnectionIndex = 0

  candidates?: Array<Candidate> | null
  visitedNodes?: Set<CapacityMeshNodeId> | null

  computeG(
    prevCandidate: Candidate,
    node: CapacityMeshNode,
    endGoal: CapacityMeshNode,
  ) {
    return (
      prevCandidate.g + this.getDistanceBetweenNodes(prevCandidate.node, node)
    )
  }

  computeH(
    prevCandidate: Candidate,
    node: CapacityMeshNode,
    endGoal: CapacityMeshNode,
  ) {
    return this.getDistanceBetweenNodes(node, endGoal)
  }

  getBacktrackedPath(candidate: Candidate) {
    const path: CapacityMeshNode[] = []
    let currentCandidate = candidate
    while (currentCandidate) {
      path.push(currentCandidate.node)
      currentCandidate = currentCandidate.prevCandidate!
    }
    return path
  }

  getNeighboringNodes(node: CapacityMeshNode) {
    return this.nodeEdgeMap
      .get(node.capacityMeshNodeId)!
      .flatMap((edge): CapacityMeshNodeId[] =>
        edge.nodeIds.filter((n) => n !== node.capacityMeshNodeId),
      )
      .map((n) => this.nodeMap.get(n)!)
  }

  getCapacityPaths() {
    const capacityPaths: CapacityPath[] = []
    for (const connection of this.connectionsWithNodes) {
      const path = connection.path
      if (path) {
        capacityPaths.push({
          capacityPathId: connection.connection.name,
          connectionName: connection.connection.name,
          nodeIds: path.map((node) => node.capacityMeshNodeId),
        })
      }
    }
    return capacityPaths
  }

  doesNodeHaveCapacityForTrace(node: CapacityMeshNode) {
    const usedCapacity =
      this.usedNodeCapacityMap.get(node.capacityMeshNodeId) ?? 0
    const totalCapacity = this.getTotalCapacity(node)
    return usedCapacity < totalCapacity
  }

  getDistanceBetweenNodes(A: CapacityMeshNode, B: CapacityMeshNode) {
    return Math.sqrt(
      (A.center.x - B.center.x) ** 2 + (A.center.y - B.center.y) ** 2,
    )
  }

  reduceCapacityAlongPath(nextConnection: {
    path: CapacityMeshNode[]
    connection: SimpleRouteConnection
  }) {
    for (const node of nextConnection.path) {
      this.usedNodeCapacityMap.set(
        node.capacityMeshNodeId,
        this.usedNodeCapacityMap.get(node.capacityMeshNodeId)! + 1,
      )
    }
  }

  _step() {
    const nextConnection =
      this.connectionsWithNodes[this.currentConnectionIndex]
    if (!nextConnection) {
      this.solved = true
      return
    }
    const [start, end] = nextConnection.nodes
    if (!this.candidates) {
      this.candidates = [{ prevCandidate: null, node: start, f: 0, g: 0, h: 0 }]
      this.visitedNodes = new Set([start.capacityMeshNodeId])
      this.activeCandidateStraightLineDistance = distance(
        start.center,
        end.center,
      )
    }

    this.candidates.sort((a, b) => a.f - b.f)
    const currentCandidate = this.candidates.shift()
    if (!currentCandidate) {
      // TODO Track failed paths, make sure solver doesn't think it solved
      console.error(
        `Ran out of candidates on connection ${nextConnection.connection.name}`,
      )
      this.currentConnectionIndex++
      this.candidates = null
      this.visitedNodes = null
      return
    }
    if (currentCandidate.node.capacityMeshNodeId === end.capacityMeshNodeId) {
      nextConnection.path = this.getBacktrackedPath(currentCandidate)

      this.reduceCapacityAlongPath(nextConnection)

      this.currentConnectionIndex++
      this.candidates = null
      this.visitedNodes = null
      return
    }

    const neighborNodes = this.getNeighboringNodes(currentCandidate.node)
    for (const neighborNode of neighborNodes) {
      if (this.visitedNodes?.has(neighborNode.capacityMeshNodeId)) {
        continue
      }
      if (!this.doesNodeHaveCapacityForTrace(neighborNode)) {
        continue
      }
      const g = this.computeG(currentCandidate, neighborNode, end)
      const h = this.computeH(currentCandidate, neighborNode, end)
      const f = g + h * this.GREEDY_MULTIPLIER
      const newCandidate = {
        prevCandidate: currentCandidate,
        node: neighborNode,
        f,
        g,
        h,
      }
      this.candidates.push(newCandidate)
    }
    this.visitedNodes!.add(currentCandidate.node.capacityMeshNodeId)
  }

  visualize(): GraphicsObject {
    const graphics: GraphicsObject = {
      lines: [],
      points: [],
      rects: [],
      circles: [],
    }

    // Visualize each solved connection path (draw a line through each node's center)
    if (this.connectionsWithNodes) {
      for (let i = 0; i < this.connectionsWithNodes.length; i++) {
        const conn = this.connectionsWithNodes[i]
        if (conn.path && conn.path.length > 0) {
          const pathPoints = conn.path.map(({ center: { x, y }, width }) => ({
            // slight offset to allow viewing overlapping paths
            x: x + (i * 0.1 * width) / 10,
            y: y + (i * 0.1 * width) / 10,
          }))
          graphics.lines!.push({
            points: pathPoints,
            strokeColor: this.colorMap[conn.connection.name],
          })
        }
      }
    }

    for (const node of this.nodes) {
      graphics.rects!.push({
        center: node.center,
        width: Math.max(node.width - 2, node.width * 0.8),
        height: Math.max(node.height - 2, node.height * 0.8),
        fill: node._containsObstacle ? "rgba(255,0,0,0.1)" : "rgba(0,0,0,0.1)",
        label: `${this.usedNodeCapacityMap.get(node.capacityMeshNodeId)}/${this.getTotalCapacity(node)}`,
      })
    }

    // Visualize connection points from each connection as circles
    if (this.connectionsWithNodes) {
      for (const conn of this.connectionsWithNodes) {
        if (conn.connection?.pointsToConnect) {
          for (const point of conn.connection.pointsToConnect) {
            graphics.points!.push({
              x: point.x,
              y: point.y,
            })
          }
        }
      }
    }

    // Visualize backtracked path of highest ranked candidate
    if (this.candidates) {
      // Get top 10 candidates
      const topCandidates = this.candidates.slice(0, 50)
      const connectionName =
        this.connectionsWithNodes[this.currentConnectionIndex].connection.name

      // Add paths for each candidate with decreasing opacity
      topCandidates.forEach((candidate, index) => {
        const opacity = 0.05 * (1 - index / 50) // Opacity decreases from 0.5 to 0.05
        const backtrackedPath = this.getBacktrackedPath(candidate)
        graphics.lines!.push({
          points: backtrackedPath.map(({ center: { x, y } }) => ({ x, y })),
          strokeColor: safeTransparentize(
            this.colorMap[connectionName] ?? "red",
            1 - opacity,
          ),
          strokeWidth: 0.5,
        })
      })
    }

    return graphics
  }
}
