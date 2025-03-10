import { RootCircuit, SimpleRouteJson } from "@tscircuit/core"
import { CapacityMeshPipelineDebugger } from "lib/testing/AutoroutingPipelineDebugger"
import { useMemo, useState } from "react"
import { Fragment } from "react/jsx-runtime"
import { CapacityMeshAutorouterCoreBinding } from "tests/fixtures/CapacityMeshAutorouterCoreBinding"
import corebug2 from "examples/assets/corebug2.json"

export default () => {
  return <CapacityMeshPipelineDebugger srj={corebug2 as any} />
}
