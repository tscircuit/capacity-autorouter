import { InteractiveGraphics } from "graphics-debug/react"
import { CapacityMeshNodeSolver } from "lib/solvers/CapacityMeshSolver/CapacityMeshNodeSolver1"
import { CapacityMeshNodeSolver3_LargerSingleLayerNodes } from "lib/solvers/CapacityMeshSolver/CapacityMeshNodeSolver3_LargerSingleLayerNodes"
import { SimpleRouteJson } from "lib/types/srj-types"
import meshunderobstacle1 from "../assets/meshunderobstacle1.json"
import { SingleLayerNodeMergerSolver } from "lib/solvers/SingleLayerNodeMerger/SingleLayerNodeMergerSolver"
import { combineVisualizations } from "lib/utils/combineVisualizations"
import { GenericSolverDebugger } from "lib/testing/GenericSolverDebugger"
import { StrawSolver } from "lib/solvers/StrawSolver/StrawSolver"

export default () => {
  const meshSolver = new CapacityMeshNodeSolver3_LargerSingleLayerNodes(
    meshunderobstacle1 as SimpleRouteJson,
    {
      capacityDepth: 7,
    },
  )
  meshSolver.solve()

  const sameLayerNodeMerger = new SingleLayerNodeMergerSolver(
    meshSolver.finishedNodes,
    Math.min(...meshSolver.finishedNodes.map((n) => n.width)),
  )
  sameLayerNodeMerger.solve()

  return (
    <GenericSolverDebugger
      createSolver={() => {
        const strawSolver = new StrawSolver({
          nodes: sameLayerNodeMerger.newNodes,
          strawSize: 0.5,
        })
        return strawSolver
      }}
    />
  )
}
