import { AutoroutingPipelineDebugger } from "lib/testing/AutoroutingPipelineDebugger"
import { SimpleRouteJson } from "lib/types"
import simpleRouteJson from "examples/assets/e2e5.json"

export default () => (
  <AutoroutingPipelineDebugger srj={simpleRouteJson as SimpleRouteJson} />
)
