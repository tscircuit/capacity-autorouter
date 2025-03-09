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
import { CapacityMeshNodeSolver } from "./CapacityMeshNodeSolver1"
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

export class CapacityMeshNodeSolver2_NodeUnderObstacle extends CapacityMeshNodeSolver {
  constructor(
    public srj: SimpleRouteJson,
    public opts: CapacityMeshNodeSolverOptions = {},
  ) {
    super(srj, opts)
  }

  isNodeCompletelyOutsideBounds(node: CapacityMeshNode): boolean {
    return (
      node.center.x + node.width / 2 < this.srj.bounds.minX ||
      node.center.x - node.width / 2 > this.srj.bounds.maxX ||
      node.center.y + node.height / 2 < this.srj.bounds.minY ||
      node.center.y - node.height / 2 > this.srj.bounds.maxY
    )
  }

  isNodePartiallyOutsideBounds(node: CapacityMeshNode): boolean {
    return (
      node.center.x - node.width / 2 < this.srj.bounds.minX ||
      node.center.x + node.width / 2 > this.srj.bounds.maxX ||
      node.center.y - node.height / 2 < this.srj.bounds.minY ||
      node.center.y + node.height / 2 > this.srj.bounds.maxY
    )
  }
  createChildNodeAtPosition(
    parent: CapacityMeshNode,
    opts: {
      center: { x: number; y: number }
      width: number
      height: number
      availableZ: number[]
      _depth?: number
    },
  ): CapacityMeshNode {
    const childNode: CapacityMeshNode = {
      capacityMeshNodeId: this.getNextNodeId(),
      center: opts.center,
      width: opts.width,
      height: opts.height,
      layer: parent.layer,
      availableZ: opts.availableZ,
      _depth: opts._depth ?? (parent._depth ?? 0) + 1,
      _parent: parent,
    }

    const overlappingObstacles = this.getXYZOverlappingObstacles(childNode)

    childNode._containsObstacle =
      overlappingObstacles.length > 0 ||
      this.isNodePartiallyOutsideBounds(childNode)

    const target = this.getTargetIfNodeContainsTarget(childNode)

    if (target) {
      childNode._targetConnectionName = target.connectionName
      childNode._containsTarget = true
    }

    if (childNode._containsObstacle) {
      childNode._completelyInsideObstacle =
        this.isNodeCompletelyInsideObstacle(childNode)
    }
    // childNode._shouldBeInGraph =
    //   (!isOutsideBounds && !childNode._completelyInsideObstacle) || childNode._

    return childNode
  }

  getZSubdivisionChildNodes(node: CapacityMeshNode): CapacityMeshNode[] {
    if (node.availableZ.length === 1) return []

    const childNodes: CapacityMeshNode[] = []

    // TODO when we have more than 2 layers, we need to handle other
    // variations, you always want to prioritize having larger contiguous
    // z-blocks
    const otherZBlocks = [[0], [1]]

    for (const zBlock of otherZBlocks) {
      const childNode = this.createChildNodeAtPosition(node, {
        center: node.center,
        width: node.width,
        height: node.height,
        availableZ: zBlock,
        // z-subdivision doesn't count towards depth, should be same as parent
        _depth: node._depth!,
      })

      if (this.isNodeCompletelyOutsideBounds(childNode)) {
        continue
      }

      childNodes.push(childNode)
    }

    return childNodes
  }

  getChildNodes(parent: CapacityMeshNode): CapacityMeshNode[] {
    if (parent._depth! >= this.MAX_DEPTH) return []
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
      const childNode = this.createChildNodeAtPosition(parent, {
        center: position,
        width: childNodeSize.width,
        height: childNodeSize.height,
        availableZ: parent.availableZ,
      })
      if (this.isNodeCompletelyOutsideBounds(childNode)) {
        continue
      }
      childNodes.push(childNode)
    }

    return childNodes
  }

  shouldNodeBeXYSubdivided(node: CapacityMeshNode) {
    if (node._depth! >= this.MAX_DEPTH) return false
    if (node._containsTarget) return true
    if (node.availableZ.length === 1 && node._depth! <= this.MAX_DEPTH)
      return true
    if (node._containsObstacle && !node._completelyInsideObstacle) return true
    return false
  }

  _step() {
    const nextNode = this.unfinishedNodes.pop()
    if (!nextNode) {
      this.solved = true
      return
    }

    const childNodes = this.getChildNodes(nextNode)

    const finishedNewNodes: CapacityMeshNode[] = []
    const unfinishedNewNodes: CapacityMeshNode[] = []

    for (const childNode of childNodes) {
      const shouldBeXYSubdivided = this.shouldNodeBeXYSubdivided(childNode)
      const shouldBeZSubdivided =
        childNode.availableZ.length > 1 &&
        !shouldBeXYSubdivided &&
        childNode._containsObstacle
      if (shouldBeXYSubdivided) {
        unfinishedNewNodes.push(childNode)
      } else if (!shouldBeXYSubdivided && !childNode._containsObstacle) {
        finishedNewNodes.push(childNode)
      } else if (!shouldBeXYSubdivided && childNode._containsTarget) {
        if (shouldBeZSubdivided) {
          const zSubNodes = this.getZSubdivisionChildNodes(childNode)
          finishedNewNodes.push(...zSubNodes)
        } else {
          finishedNewNodes.push(childNode)
        }
      } else if (shouldBeZSubdivided) {
        finishedNewNodes.push(
          ...this.getZSubdivisionChildNodes(childNode).filter(
            (zSubNode) => !zSubNode._containsObstacle,
          ),
        )
      }
    }

    this.unfinishedNodes.push(...unfinishedNewNodes)
    this.finishedNodes.push(...finishedNewNodes)
  }
}
