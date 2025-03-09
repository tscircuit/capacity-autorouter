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
import { CapacityMeshNodeSolver2_NodeUnderObstacle } from "./CapacityMeshNodeSolver2_NodesUnderObstacles"

export class CapacityMeshNodeSolver3_LargerSingleLayerNodes extends CapacityMeshNodeSolver2_NodeUnderObstacle {
  shouldNodeBeXYSubdivided(node: CapacityMeshNode) {
    if (node.availableZ.length === 1) return false
    if (node._depth! >= this.MAX_DEPTH) return false
    if (node._containsTarget) return true
    // if (node.availableZ.length === 1 && node._depth! <= this.MAX_DEPTH - 4)
    //   return true
    if (node._containsObstacle && !node._completelyInsideObstacle) return true
    return false
  }
}
