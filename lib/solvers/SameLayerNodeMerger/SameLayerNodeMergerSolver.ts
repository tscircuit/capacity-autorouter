import { CapacityMeshNode, CapacityMeshNodeId } from "lib/types"
import { BaseSolver } from "../BaseSolver"
import { areNodesBordering } from "lib/utils/areNodesBordering"
import { GraphicsObject } from "graphics-debug"
import { createRectFromCapacityNode } from "lib/utils/createRectFromCapacityNode"

const EPSILON = 0.005

/**
 * Merges same layer nodes into larger nodes. Pre-processing stage necessary
 * for "strawing".
 */
export class SameLayerNodeMergerSolver extends BaseSolver {
  nodeMap: Map<CapacityMeshNodeId, CapacityMeshNode>
  currentBatchNodeIds: CapacityMeshNodeId[]

  processedNodeIds: Set<CapacityMeshNodeId>

  nextBatchNodeIds: CapacityMeshNodeId[]
  batchHadModifications: boolean

  newNodes: CapacityMeshNode[]
  constructor(nodes: CapacityMeshNode[], minCellSize: number) {
    super()
    this.nodeMap = new Map()
    this.MAX_ITERATIONS = 100_000
    for (const node of nodes) {
      this.nodeMap.set(node.capacityMeshNodeId, node)
    }
    this.newNodes = []
    this.processedNodeIds = new Set()
    const nodeWithArea: Array<[string, number]> = []
    for (const node of nodes) {
      if (node.availableZ.length > 1) {
        this.newNodes.push(node)
        this.processedNodeIds.add(node.capacityMeshNodeId)
      } else {
        nodeWithArea.push([node.capacityMeshNodeId, node.width * node.height])
      }
    }
    nodeWithArea.sort((a, b) => a[1] - b[1])
    this.currentBatchNodeIds = nodeWithArea.map((n) => n[0])
    this.nextBatchNodeIds = []
    this.batchHadModifications = false
  }

  getAdjacentSameLayerUnprocessedNodes(rootNode: CapacityMeshNode) {
    const adjacentNodes: CapacityMeshNode[] = []
    for (const unprocessedNodeId of this.currentBatchNodeIds) {
      const unprocessedNode = this.nodeMap.get(unprocessedNodeId)!
      if (unprocessedNode.availableZ[0] !== rootNode.availableZ[0]) continue
      if (!areNodesBordering(rootNode, unprocessedNode)) continue
      adjacentNodes.push(unprocessedNode)
    }
    return adjacentNodes
  }

  _step() {
    let rootNodeId = this.currentBatchNodeIds.pop()
    while (rootNodeId && this.processedNodeIds.has(rootNodeId)) {
      rootNodeId = this.currentBatchNodeIds.pop()
    }

    if (!rootNodeId) {
      if (this.batchHadModifications) {
        this.currentBatchNodeIds = this.nextBatchNodeIds.sort((a, b) => {
          const A = this.nodeMap.get(a)!
          const B = this.nodeMap.get(b)!
          return A.width * A.height - B.width * B.height
        })
        this.nextBatchNodeIds = []
        this.batchHadModifications = false
        return
      }

      this.solved = true
      this.newNodes.push(
        ...this.nextBatchNodeIds.map((id) => this.nodeMap.get(id)!),
      )
      return
    }

    const rootNode = this.nodeMap.get(rootNodeId)!
    let rootNodeHasGrown = false

    const adjacentNodes = this.getAdjacentSameLayerUnprocessedNodes(rootNode)

    if (adjacentNodes.length === 0) {
      // this.processedNodeIds.add(rootNodeId)
      // this.newNodes.push(rootNode)
      this.nextBatchNodeIds.push(rootNodeId)
      return
    }

    // Handle adjacent nodes to the LEFT
    const adjacentNodesToLeft = adjacentNodes.filter(
      (adjNode) =>
        adjNode.center.x < rootNode.center.x &&
        Math.abs(adjNode.center.y - rootNode.center.y) < rootNode.height / 2,
    )

    if (adjacentNodesToLeft.length > 0) {
      const { width: adjNodeWidth, height: adjNodeHeight } =
        adjacentNodesToLeft[0]
      const leftAdjNodesAreAllSameSize = adjacentNodesToLeft.every(
        (adjNode) =>
          adjNode.width === adjNodeWidth && adjNode.height === adjNodeHeight,
      )

      const leftAdjNodesTakeUpEntireHeight =
        Math.abs(
          adjacentNodesToLeft.reduce((acc, adjNode) => {
            return acc + adjNode.height
          }, 0) - rootNode.height,
        ) < EPSILON

      if (leftAdjNodesTakeUpEntireHeight && leftAdjNodesAreAllSameSize) {
        rootNode.width += adjNodeWidth
        rootNode.center.x = rootNode.center.x - adjNodeWidth / 2

        for (const adjNode of adjacentNodesToLeft) {
          this.processedNodeIds.add(adjNode.capacityMeshNodeId)
        }

        rootNodeHasGrown = true
      }
    }

    // Handle adjacent nodes to the RIGHT
    const adjacentNodesToRight = adjacentNodes.filter(
      (adjNode) =>
        adjNode.center.x > rootNode.center.x &&
        Math.abs(adjNode.center.y - rootNode.center.y) < rootNode.height / 2,
    )

    if (adjacentNodesToRight.length > 0 && !rootNodeHasGrown) {
      const { width: adjNodeWidth, height: adjNodeHeight } =
        adjacentNodesToRight[0]
      const rightAdjNodesAreAllSameSize = adjacentNodesToRight.every(
        (adjNode) =>
          adjNode.width === adjNodeWidth && adjNode.height === adjNodeHeight,
      )

      const rightAdjNodesTakeUpEntireHeight =
        Math.abs(
          adjacentNodesToRight.reduce((acc, adjNode) => {
            return acc + adjNode.height
          }, 0) - rootNode.height,
        ) < EPSILON

      if (rightAdjNodesTakeUpEntireHeight && rightAdjNodesAreAllSameSize) {
        rootNode.width += adjNodeWidth
        rootNode.center.x = rootNode.center.x + adjNodeWidth / 2

        for (const adjNode of adjacentNodesToRight) {
          this.processedNodeIds.add(adjNode.capacityMeshNodeId)
        }

        rootNodeHasGrown = true
      }
    }

    // Handle adjacent nodes to the TOP
    const adjacentNodesToTop = adjacentNodes.filter(
      (adjNode) =>
        adjNode.center.y > rootNode.center.y &&
        Math.abs(adjNode.center.x - rootNode.center.x) < rootNode.width / 2,
    )

    if (adjacentNodesToTop.length > 0 && !rootNodeHasGrown) {
      const { width: adjNodeWidth, height: adjNodeHeight } =
        adjacentNodesToTop[0]
      const topAdjNodesAreAllSameSize = adjacentNodesToTop.every(
        (adjNode) =>
          adjNode.width === adjNodeWidth && adjNode.height === adjNodeHeight,
      )

      const topAdjNodesTakeUpEntireWidth =
        Math.abs(
          adjacentNodesToTop.reduce((acc, adjNode) => {
            return acc + adjNode.width
          }, 0) - rootNode.width,
        ) < EPSILON

      if (topAdjNodesTakeUpEntireWidth && topAdjNodesAreAllSameSize) {
        rootNode.height += adjNodeHeight
        rootNode.center.y = rootNode.center.y + adjNodeHeight / 2

        for (const adjNode of adjacentNodesToTop) {
          this.processedNodeIds.add(adjNode.capacityMeshNodeId)
        }

        rootNodeHasGrown = true
      }
    }

    // Handle adjacent nodes to the BOTTOM
    const adjacentNodesToBottom = adjacentNodes.filter(
      (adjNode) =>
        adjNode.center.y < rootNode.center.y &&
        Math.abs(adjNode.center.x - rootNode.center.x) < rootNode.width / 2,
    )

    if (adjacentNodesToBottom.length > 0 && !rootNodeHasGrown) {
      const { width: adjNodeWidth, height: adjNodeHeight } =
        adjacentNodesToBottom[0]
      const bottomAdjNodesAreAllSameSize = adjacentNodesToBottom.every(
        (adjNode) =>
          adjNode.width === adjNodeWidth && adjNode.height === adjNodeHeight,
      )

      const bottomAdjNodesTakeUpEntireWidth =
        Math.abs(
          adjacentNodesToBottom.reduce((acc, adjNode) => {
            return acc + adjNode.width
          }, 0) - rootNode.width,
        ) < EPSILON

      if (bottomAdjNodesTakeUpEntireWidth && bottomAdjNodesAreAllSameSize) {
        rootNode.height += adjNodeHeight
        rootNode.center.y = rootNode.center.y - adjNodeHeight / 2

        for (const adjNode of adjacentNodesToBottom) {
          this.processedNodeIds.add(adjNode.capacityMeshNodeId)
        }

        rootNodeHasGrown = true
      }
    }

    if (rootNodeHasGrown) {
      this.currentBatchNodeIds.push(rootNodeId)
    } else {
      this.nextBatchNodeIds.unshift(rootNodeId)
      // this.processedNodeIds.add(rootNodeId)
      // this.newNodes.push(rootNode)
    }
  }

  visualize(): GraphicsObject {
    const graphics = {
      circles: [],
      lines: [],
      points: [],
      rects: [],
      coordinateSystem: "cartesian",
      title: "Same Layer Node Merger",
    } as Required<GraphicsObject>

    for (const node of this.newNodes) {
      graphics.rects.push(createRectFromCapacityNode(node))
    }

    // Visualize unprocessed nodes with a different style
    for (const nodeId of this.currentBatchNodeIds) {
      const node = this.nodeMap.get(nodeId)
      if (this.processedNodeIds.has(nodeId)) continue
      if (node) {
        const rect = createRectFromCapacityNode(node, {
          rectMargin: 0.01,
        })
        rect.stroke = "rgba(255, 165, 0, 0.8)" // Orange border
        rect.label = `${rect.label}\n(unprocessed)`
        graphics.rects.push(rect)
      }
    }

    // Visualize next batch nodes with a different style
    for (const nodeId of this.nextBatchNodeIds) {
      const node = this.nodeMap.get(nodeId)
      if (node) {
        const rect = createRectFromCapacityNode(node, {
          rectMargin: 0.01,
        })
        rect.stroke = "rgba(0, 255, 0, 0.8)" // Green border
        rect.label = `${rect.label}\n(next batch)`
        graphics.rects.push(rect)
      }
    }

    return graphics
  }
}
