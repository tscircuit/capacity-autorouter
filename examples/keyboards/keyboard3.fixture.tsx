import { CapacityMeshPipelineDebugger } from "lib/testing/CapacityMeshPipelineDebugger"
import keyboard3 from "examples/assets/keyboard3.json"
import type { SimpleRouteJson } from "lib/types"

export default () => {
  return (
    <CapacityMeshPipelineDebugger
      srj={keyboard3 as unknown as SimpleRouteJson}
      animationSpeed={10}
    />
  )
}
