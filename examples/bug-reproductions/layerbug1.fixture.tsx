import { CapacityMeshPipelineDebugger } from "lib/testing/AutoroutingPipelineDebugger"
import boardWithTopAndBottom from "examples/assets/boardwithtopandbottom.json"

export default () => {
  return <CapacityMeshPipelineDebugger srj={boardWithTopAndBottom as any} />
}
