import type { GraphicsObject } from "graphics-debug"
import { BaseSolver } from "../BaseSolver"
import type {
  CapacityMeshEdge,
  CapacityMeshNode,
  CapacityMeshNodeId,
  Obstacle,
  SimpleRouteJson,
} from "../../types"
import { COLORS } from "../colors"
import { isPointInRect } from "lib/utils/isPointInRect"
import { doRectsOverlap } from "lib/utils/doRectsOverlap"
import { mapLayerNameToZ } from "lib/utils/mapLayerNameToZ"

interface CapacityMeshNodeSolverOptions {
  capacityDepth?: number
}

interface Target {
  x: number
  y: number
  connectionName: string
  availableZ: number[]
}

export class CapacityMeshNodeSolver extends BaseSolver {
  unfinishedNodes: CapacityMeshNode[]
  finishedNodes: CapacityMeshNode[]

  nodeToXYOverlappingObstaclesMap: Map<CapacityMeshNodeId, Obstacle[]>
  layerCount: number

  // targetObstacleMap: Record<string, { obstacle: Obstacle, node: CapacityMeshNode }>

  MAX_DEPTH = 4

  targets: Target[]

  constructor(
    public srj: SimpleRouteJson,
    public opts: CapacityMeshNodeSolverOptions = {},
  ) {
    super()
    this.MAX_DEPTH = opts?.capacityDepth ?? this.MAX_DEPTH
    this.MAX_ITERATIONS = 100_000
    this.layerCount = srj.layerCount ?? 2

    for (const obstacle of srj.obstacles) {
      if (!obstacle.zLayers) {
        const zLayers: number[] = []
        for (const layer of obstacle.layers) {
          zLayers.push(mapLayerNameToZ(layer, srj.layerCount))
        }
        obstacle.zLayers = zLayers
      }
    }

    const boundsCenter = {
      x: (srj.bounds.minX + srj.bounds.maxX) / 2,
      y: (srj.bounds.minY + srj.bounds.maxY) / 2,
    }
    const boundsSize = {
      width: srj.bounds.maxX - srj.bounds.minX,
      height: srj.bounds.maxY - srj.bounds.minY,
    }
    const maxWidthHeight = Math.max(boundsSize.width, boundsSize.height)
    this.unfinishedNodes = [
      {
        capacityMeshNodeId: this.getNextNodeId(),
        center: boundsCenter,
        width: maxWidthHeight,
        height: maxWidthHeight,
        layer: "top",
        availableZ: [0, 1],
        _depth: 0,
        _containsTarget: true,
        _containsObstacle: true,
        _completelyInsideObstacle: false,
      },
    ]
    this.finishedNodes = []
    this.nodeToXYOverlappingObstaclesMap = new Map()
    this.targets = this.srj.connections.flatMap((c) =>
      c.pointsToConnect.map((p) => ({
        ...p,
        connectionName: c.name,
        availableZ: p.layer === "top" ? [0] : [1],
      })),
    )
  }

  _nextNodeCounter = 0
  getNextNodeId(): string {
    return `cn${this._nextNodeCounter++}`
  }

  getCapacityFromDepth(depth: number): number {
    return (this.MAX_DEPTH - depth + 1) ** 2
  }

  getTargetIfNodeContainsTarget(node: CapacityMeshNode): Target | null {
    const overlappingObstacles = this.getXYOverlappingObstacles(node)
    for (const target of this.targets) {
      // if (target.layer !== node.layer) continue
      if (!target.availableZ.some((z) => node.availableZ.includes(z))) continue

      const targetObstacle = overlappingObstacles.find((o) =>
        isPointInRect(target, o),
      )

      if (targetObstacle) {
        if (doRectsOverlap(node, targetObstacle)) {
          return target
        }
      }

      if (
        target.x >= node.center.x - node.width / 2 &&
        target.x <= node.center.x + node.width / 2 &&
        target.y >= node.center.y - node.height / 2 &&
        target.y <= node.center.y + node.height / 2
      ) {
        return target
      }
    }
    return null
  }

  getXYOverlappingObstacles(node: CapacityMeshNode): Obstacle[] {
    const cachedObstacles = this.nodeToXYOverlappingObstaclesMap.get(
      node.capacityMeshNodeId,
    )
    if (cachedObstacles) {
      return cachedObstacles
    }
    const overlappingObstacles: Obstacle[] = []

    // Compute node bounds
    const nodeLeft = node.center.x - node.width / 2
    const nodeRight = node.center.x + node.width / 2
    const nodeTop = node.center.y - node.height / 2
    const nodeBottom = node.center.y + node.height / 2

    const obstacles = node._parent
      ? this.getXYOverlappingObstacles(node._parent)
      : this.srj.obstacles
    for (const obstacle of obstacles) {
      const obsLeft = obstacle.center.x - obstacle.width / 2
      const obsRight = obstacle.center.x + obstacle.width / 2
      const obsTop = obstacle.center.y - obstacle.height / 2
      const obsBottom = obstacle.center.y + obstacle.height / 2

      // Check for intersection.
      if (
        nodeRight >= obsLeft &&
        nodeLeft <= obsRight &&
        nodeBottom >= obsTop &&
        nodeTop <= obsBottom
      ) {
        overlappingObstacles.push(obstacle)
        continue
      }

      // Check if the node is completely within the obstacle
      if (
        nodeLeft >= obsLeft &&
        nodeRight <= obsRight &&
        nodeTop >= obsTop &&
        nodeBottom <= obsBottom
      ) {
        // Node is completely inside the obstacle
        overlappingObstacles.push(obstacle)
        continue
      }

      // Check if obstacle is completely within node
      if (
        obsLeft >= nodeLeft &&
        obsRight <= nodeRight &&
        obsTop >= nodeTop &&
        obsBottom <= nodeBottom
      ) {
        overlappingObstacles.push(obstacle)
      }
    }

    this.nodeToXYOverlappingObstaclesMap.set(
      node.capacityMeshNodeId,
      overlappingObstacles,
    )

    return overlappingObstacles
  }

  getXYZOverlappingObstacles(node: CapacityMeshNode): Obstacle[] {
    const xyOverlappingObstacles = this.getXYOverlappingObstacles(node)

    // For each obstacle, check if it has any overlap in the z-axis
    const xyzOverlappingObstacles: Obstacle[] = []
    for (const obstacle of xyOverlappingObstacles) {
      if (node.availableZ.some((z) => obstacle.zLayers!.includes(z))) {
        xyzOverlappingObstacles.push(obstacle)
      }
    }

    return xyzOverlappingObstacles
  }

  /**
   * Checks if the given mesh node overlaps with any obstacle.
   * We treat both obstacles and nodes as axis‐aligned rectangles.
   */
  doesNodeOverlapObstacle(node: CapacityMeshNode): boolean {
    const overlappingObstacles = this.getXYZOverlappingObstacles(node)

    if (overlappingObstacles.length > 0) {
      return true
    }

    // Compute node bounds
    const nodeLeft = node.center.x - node.width / 2
    const nodeRight = node.center.x + node.width / 2
    const nodeTop = node.center.y - node.height / 2
    const nodeBottom = node.center.y + node.height / 2

    // If node is outside the bounds, we consider it to contain an obstacle
    if (
      nodeLeft < this.srj.bounds.minX ||
      nodeRight > this.srj.bounds.maxX ||
      nodeTop < this.srj.bounds.minY ||
      nodeBottom > this.srj.bounds.maxY
    ) {
      return true
    }
    return false
  }

  /**
   * Checks if the entire node is contained within any obstacle.
   */
  isNodeCompletelyInsideObstacle(node: CapacityMeshNode): boolean {
    const overlappingObstacles = this.getXYZOverlappingObstacles(node)

    // Compute node bounds
    const nodeLeft = node.center.x - node.width / 2
    const nodeRight = node.center.x + node.width / 2
    const nodeTop = node.center.y - node.height / 2
    const nodeBottom = node.center.y + node.height / 2

    for (const obstacle of overlappingObstacles) {
      const obsLeft = obstacle.center.x - obstacle.width / 2
      const obsRight = obstacle.center.x + obstacle.width / 2
      const obsTop = obstacle.center.y - obstacle.height / 2
      const obsBottom = obstacle.center.y + obstacle.height / 2

      // Check if the node's bounds are completely inside the obstacle's bounds.
      if (
        nodeLeft >= obsLeft &&
        nodeRight <= obsRight &&
        nodeTop >= obsTop &&
        nodeBottom <= obsBottom
      ) {
        return true
      }
    }

    // if (
    //   nodeRight < this.srj.bounds.minX ||
    //   nodeLeft > this.srj.bounds.maxX ||
    //   nodeBottom < this.srj.bounds.minY ||
    //   nodeTop > this.srj.bounds.maxY
    // ) {
    //   return true
    // }

    return false
  }

  getChildNodes(parent: CapacityMeshNode): CapacityMeshNode[] {
    if (parent._depth === this.MAX_DEPTH) return []
    const childNodes: CapacityMeshNode[] = []

    const childNodeSize = { width: parent.width / 2, height: parent.height / 2 }

    const childNodePositions = [
      {
        x: parent.center.x - childNodeSize.width / 2,
        y: parent.center.y - childNodeSize.height / 2,
      },
      {
        x: parent.center.x + childNodeSize.width / 2,
        y: parent.center.y - childNodeSize.height / 2,
      },
      {
        x: parent.center.x - childNodeSize.width / 2,
        y: parent.center.y + childNodeSize.height / 2,
      },
      {
        x: parent.center.x + childNodeSize.width / 2,
        y: parent.center.y + childNodeSize.height / 2,
      },
    ]

    for (const position of childNodePositions) {
      const childNode: CapacityMeshNode = {
        capacityMeshNodeId: this.getNextNodeId(),
        center: position,
        width: childNodeSize.width,
        height: childNodeSize.height,
        layer: parent.layer,
        availableZ: [0, 1],
        _depth: (parent._depth ?? 0) + 1,
        _parent: parent,
      }
      childNode._containsObstacle = this.doesNodeOverlapObstacle(childNode)

      const target = this.getTargetIfNodeContainsTarget(childNode)

      if (target) {
        childNode._targetConnectionName = target.connectionName
        childNode.availableZ = target.availableZ
        childNode._containsTarget = true
      }

      if (childNode._containsObstacle) {
        childNode._completelyInsideObstacle =
          this.isNodeCompletelyInsideObstacle(childNode)
      }
      if (childNode._completelyInsideObstacle && !childNode._containsTarget)
        continue
      childNodes.push(childNode)
    }

    return childNodes
  }

  shouldNodeBeXYSubdivided(node: CapacityMeshNode) {
    if (node._depth! >= this.MAX_DEPTH) return false
    if (node._containsTarget) return true
    if (node._containsObstacle && !node._completelyInsideObstacle) return true
    return false
  }

  _step() {
    const nextNode = this.unfinishedNodes.pop()
    if (!nextNode) {
      this.solved = true
      return
    }

    const newNodes = this.getChildNodes(nextNode)

    const finishedNewNodes: CapacityMeshNode[] = []
    const unfinishedNewNodes: CapacityMeshNode[] = []

    for (const newNode of newNodes) {
      const shouldBeSubdivided = this.shouldNodeBeXYSubdivided(newNode)
      if (shouldBeSubdivided) {
        unfinishedNewNodes.push(newNode)
      } else if (!shouldBeSubdivided && !newNode._containsObstacle) {
        finishedNewNodes.push(newNode)
      } else if (!shouldBeSubdivided && newNode._containsTarget) {
        finishedNewNodes.push(newNode)
      }
    }

    this.unfinishedNodes.push(...unfinishedNewNodes)
    this.finishedNodes.push(...finishedNewNodes)
  }

  /**
   * Creates a GraphicsObject to visualize the mesh, its nodes, obstacles, and connection points.
   *
   * - Mesh nodes are rendered as rectangles.
   *   - Nodes that have an obstacle intersection are outlined in red.
   *   - Other nodes are outlined in green.
   * - Lines are drawn from a node to its parent.
   * - Obstacles are drawn as semi-transparent red rectangles.
   * - Points for each connection’s pointsToConnect are drawn in a unique color.
   */
  visualize(): GraphicsObject {
    const graphics: GraphicsObject = {
      lines: [],
      points: [],
      rects: [],
      circles: [],
      coordinateSystem: "cartesian",
      title: "Capacity Mesh Visualization",
    }

    // Draw obstacles
    for (const obstacle of this.srj.obstacles) {
      graphics.rects!.push({
        center: obstacle.center,
        width: obstacle.width,
        height: obstacle.height,
        fill:
          obstacle.zLayers?.length === 1 && obstacle.zLayers?.includes(1)
            ? "rgba(0,0,255,0.3)"
            : "rgba(255,0,0,0.3)",
        stroke: "red",
        label: ["obstacle", `z: ${obstacle.zLayers!.join(",")}`].join("\n"),
      })
    }

    // Draw mesh nodes (both finished and unfinished)
    const allNodes = [...this.finishedNodes, ...this.unfinishedNodes]
    for (const node of allNodes) {
      const lowestZ = Math.min(...node.availableZ)
      const isNextToBeProcessed =
        this.unfinishedNodes.length > 0 &&
        node === this.unfinishedNodes[this.unfinishedNodes.length - 1]

      graphics.rects!.push({
        center: {
          x: node.center.x + lowestZ * node.width * 0.05,
          y: node.center.y - lowestZ * node.width * 0.05,
        },
        width: Math.max(node.width - 2, node.width * 0.8),
        height: Math.max(node.height - 2, node.height * 0.8),
        fill: node._containsObstacle
          ? "rgba(255,0,0,0.1)"
          : ({
              "0,1": "rgba(0,0,0,0.1)",
              "0": "rgba(0,200,200, 0.1)",
              "1": "rgba(0,0,200, 0.1)",
            }[node.availableZ.join(",")] ?? "rgba(0,200,200,0.1)"),
        stroke: isNextToBeProcessed ? "rgba(255,165,0,0.5)" : undefined,
        label: [
          node.capacityMeshNodeId,
          `availableZ: ${node.availableZ.join(",")}`,
          `target? ${node._containsTarget ?? false}`,
          `obs? ${node._containsObstacle ?? false}`,
        ].join("\n"),
      })
    }
    graphics.rects!.sort((a, b) => a.center.y - b.center.y)

    // Draw connection points (each connection gets a unique color).
    this.srj.connections.forEach((connection, index) => {
      const color = COLORS[index % COLORS.length]
      for (const pt of connection.pointsToConnect) {
        graphics.points!.push({
          x: pt.x,
          y: pt.y,
          label: `conn-${index} (${pt.layer})`,
          color,
        })
      }
    })

    return graphics
  }
}
