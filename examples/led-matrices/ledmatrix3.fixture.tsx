import { InteractiveGraphics } from "graphics-debug/react"
import contributionBoardRoutes from "examples/assets/contribution-board_routes.json"
import { CapacityMeshPipelineDebugger } from "lib/testing/AutoroutingPipelineDebugger"
import type { SimpleRouteJson } from "lib/types"

export default () => (
  <CapacityMeshPipelineDebugger
    srj={contributionBoardRoutes as unknown as SimpleRouteJson}
  />
)
