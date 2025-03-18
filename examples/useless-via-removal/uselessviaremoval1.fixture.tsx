import { GenericSolverDebugger } from "lib/testing/GenericSolverDebugger"
import inputData from "examples/assets/simplifiedpathsolver4.json"
import { MultiSimplifiedPathSolver } from "lib/solvers/SimplifiedPathSolver/MultiSimplifiedPathSolver"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { RemoveUselessViaSolver } from "lib/solvers/RemoveUselessViasSolver/RemoveUselessViasSolver"
import { createColorMapFromStrings } from "lib/solvers/colors"

export default () => {
  const createSolver = () => {
    return new RemoveUselessViaSolver({
      obstacles: inputData[0].obstacles,
      routes: inputData[0].unsimplifiedHdRoutes,
      colorMap: inputData[0].colorMap,
      // connMap: new ConnectivityMap(inputData[0].connMap.netMap),
    })
  }

  return <GenericSolverDebugger createSolver={createSolver} />
}
