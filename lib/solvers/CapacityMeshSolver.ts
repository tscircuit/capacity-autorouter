import type { GraphicsObject } from "graphics-debug"
import { BaseSolver } from "./BaseSolver"
import type {
  CapacityMeshEdge,
  CapacityMeshNode,
  SimpleRouteJson,
} from "../types"

export class CapacityMeshSolver extends BaseSolver {
  unfinishedNodes: CapacityMeshNode[]
  finishedNodes: CapacityMeshNode[]
  edges: CapacityMeshEdge[]

  MAX_DEPTH = 4

  constructor(public srj: SimpleRouteJson) {
    super()
    const boundsCenter = {
      x: (srj.bounds.minX + srj.bounds.maxX) / 2,
      y: (srj.bounds.minY + srj.bounds.maxY) / 2,
    }
    const boundsSize = {
      width: srj.bounds.maxX - srj.bounds.minX,
      height: srj.bounds.maxY - srj.bounds.minY,
    }
    this.unfinishedNodes = [
      {
        capacityMeshNodeId: this.getNextNodeId(),
        center: boundsCenter,
        width: boundsSize.width,
        height: boundsSize.height,
        layer: "top",
        totalCapacity: this.getCapacityFromDepth(0),
        _depth: 0,
      },
    ]
    this.finishedNodes = []
    this.edges = []
  }

  _nextNodeCounter = 0
  getNextNodeId(): string {
    return `cn${this._nextNodeCounter++}`
  }

  getCapacityFromDepth(depth: number): number {
    return (this.MAX_DEPTH - depth) ** 2
  }

  /**
   * Checks if the given mesh node overlaps with any obstacle.
   * We treat both obstacles and nodes as axis‐aligned rectangles.
   */
  doesNodeContainObstacle(node: CapacityMeshNode): boolean {
    const obstacles = this.srj.obstacles
    // Compute node bounds
    const nodeLeft = node.center.x - node.width / 2
    const nodeRight = node.center.x + node.width / 2
    const nodeTop = node.center.y - node.height / 2
    const nodeBottom = node.center.y + node.height / 2

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
        return true
      }
    }
    return false
  }

  /**
   * Checks if the entire node is contained within any obstacle.
   */
  isNodeCompletelyInsideObstacle(node: CapacityMeshNode): boolean {
    const obstacles = this.srj.obstacles
    // Compute node bounds
    const nodeLeft = node.center.x - node.width / 2
    const nodeRight = node.center.x + node.width / 2
    const nodeTop = node.center.y - node.height / 2
    const nodeBottom = node.center.y + node.height / 2

    for (const obstacle of obstacles) {
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
        totalCapacity: this.getCapacityFromDepth((parent._depth ?? 0) + 1),
        _depth: (parent._depth ?? 0) + 1,
        _parent: parent,
      }
      childNode._containsObstacle = this.doesNodeContainObstacle(childNode)
      if (childNode._containsObstacle) {
        childNode._completelyInsideObstacle =
          this.isNodeCompletelyInsideObstacle(childNode)
      }
      if (childNode._completelyInsideObstacle) continue
      childNodes.push(childNode)
    }

    return childNodes
  }

  shouldNodeBeSubdivided(node: CapacityMeshNode) {
    return node._depth !== this.MAX_DEPTH
  }

  step() {
    const nextNode = this.unfinishedNodes.pop()
    if (!nextNode) {
      this.solved = true
      return
    }

    const newNodes = this.getChildNodes(nextNode)

    const finishedNewNodes: CapacityMeshNode[] = []
    const unfinishedNewNodes: CapacityMeshNode[] = []

    for (const newNode of newNodes) {
      if (this.shouldNodeBeSubdivided(newNode)) {
        unfinishedNewNodes.push(newNode)
      } else {
        finishedNewNodes.push(newNode)
      }
    }

    this.unfinishedNodes.push(...unfinishedNewNodes)
    this.finishedNodes.push(...finishedNewNodes)
  }

  /**
   * Creates a GraphicsObject to visualize the mesh, its nodes, and obstacles.
   *
   * - Mesh nodes are rendered as rectangles.
   *   - Nodes that have an obstacle intersection are outlined in red.
   *   - Other nodes are outlined in green.
   * - Lines are drawn from a node to its parent.
   * - Obstacles are drawn as semi-transparent red rectangles.
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

    // Draw mesh nodes (both finished and unfinished)
    const allNodes = [...this.finishedNodes, ...this.unfinishedNodes]
    for (const node of allNodes) {
      // Choose stroke color: red if the node overlaps an obstacle, green otherwise.
      const strokeColor = node._containsObstacle ? "red" : "green"
      graphics.rects!.push({
        center: node.center,
        width: node.width,
        height: node.height,
        fill: "none",
        stroke: strokeColor,
        label: node.capacityMeshNodeId,
      })

      // Optionally add a point at the node center.
      graphics.points!.push({
        x: node.center.x,
        y: node.center.y,
        label: node.capacityMeshNodeId,
        color: strokeColor,
      })

      // Draw a line from the node to its parent (if it exists)
      if (node._parent) {
        graphics.lines!.push({
          points: [node._parent.center, node.center],
          strokeWidth: 1,
          strokeColor: "gray",
          label: "parent connection",
        })
      }
    }

    // Draw obstacles
    for (const obstacle of this.srj.obstacles) {
      graphics.rects!.push({
        center: obstacle.center,
        width: obstacle.width,
        height: obstacle.height,
        fill: "rgba(255,0,0,0.3)",
        stroke: "red",
        label: "obstacle",
      })
    }

    return graphics
  }
}
