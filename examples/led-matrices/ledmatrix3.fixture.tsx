import { InteractiveGraphics } from "graphics-debug/react"
import contributionBoardRoutes from "examples/assets/contribution-board_routes.json"
import { CapacityMeshSolver } from "lib/solvers/AutoroutingPipelineSolver"
import type { SimpleRouteJson } from "lib/types"
import { useState } from "react"
import { combineVisualizations } from "lib/utils/combineVisualizations"
import { NodePortSegment } from "lib/types/capacity-edges-to-port-segments-types"

export default () => {
  const [solver] = useState(
    () =>
      new CapacityMeshSolver(
        contributionBoardRoutes as unknown as SimpleRouteJson,
        {
          capacityDepth: 9,
        },
      ),
  )
  const [, forceUpdate] = useState({})
  const failedHdSolvers = solver.highDensityRouteSolver?.failedSolvers

  const animateToNextSolver = () => {
    const currentSolver = solver.activeSubSolver
    const interval = setInterval(() => {
      solver.step()
      forceUpdate({})
      if (!solver.activeSubSolver || solver.activeSubSolver !== currentSolver) {
        clearInterval(interval)
      }
    }, 10)
  }

  const animateUntilSolved = () => {
    let stepsOfSameSolver = 0
    let lastSolver = solver.activeSubSolver
    const interval = setInterval(() => {
      for (let i = 0; i < 10 + stepsOfSameSolver / 100; i++) {
        if (solver.activeSubSolver === lastSolver) {
          stepsOfSameSolver++
        } else {
          stepsOfSameSolver = 0
          lastSolver = solver.activeSubSolver
        }
        solver.step()
      }
      forceUpdate({})
      if (solver.solved || solver.failed) {
        clearInterval(interval)
      }
    }, 10)
  }

  return (
    <>
      <div className="border p-1 m-1">Iterations {solver.iterations}</div>
      <button
        className="border m-2 p-2"
        onClick={() => {
          solver.step()
          forceUpdate({})
        }}
      >
        Step
      </button>
      <button
        className="border m-2 p-2"
        onClick={() => {
          const ogSolver = solver.activeSubSolver
          while (
            solver.activeSubSolver === ogSolver &&
            !solver.activeSubSolver?.failed &&
            !solver.activeSubSolver?.solved
          ) {
            solver.step()
          }
          forceUpdate({})
        }}
      >
        Solve One
      </button>
      <button className="border m-2 p-2" onClick={animateToNextSolver}>
        Animate to next solver
      </button>
      <button className="border m-2 p-2" onClick={animateUntilSolved}>
        Animate until solved
      </button>
      <InteractiveGraphics
        graphics={
          solver.solved
            ? solver.highDensityRouteSolver!.visualize()
            : solver.failed
              ? solver.visualize()
              : // Fixes dumb animation bug
                combineVisualizations({}, solver.visualize())
        }
      />
      <p className="border-t mt-2 text-gray-500">Solver Inputs</p>
      {solver.segmentToPointSolver && (
        <button
          className="border m-2 p-2"
          onClick={() => {
            const allSegments = solver.segmentToPointSolver!.solvedSegments
            const inputs = {
              segments: allSegments,
              colorMap: solver.colorMap,
              nodes: solver
                .nodeTargetMerger!.newNodes.map((n) => ({
                  ...n,
                  _parent: undefined,
                }))
                .filter((n) =>
                  allSegments.some(
                    (s) => s.capacityMeshNodeId === n.capacityMeshNodeId,
                  ),
                ),
            }
            navigator.clipboard.writeText(JSON.stringify(inputs))
            const textarea = document.createElement("textarea")
            textarea.value = JSON.stringify(inputs)
            document.body.appendChild(textarea)
            alert("Added to body")
          }}
        >
          Segment to Point Solver
        </button>
      )}
      <p className="border-t mt-2 text-gray-500">
        Failed IntraNode High Density Solvers
      </p>
      {failedHdSolvers?.map((s) => (
        <button
          className="border m-2 p-2"
          key={s.nodeWithPortPoints.capacityMeshNodeId}
          onClick={() => {
            const json = JSON.stringify({
              nodeWithPortPoints: s.nodeWithPortPoints,
            })
            navigator.clipboard.writeText(json)
            alert("Copied to clipboard")
          }}
        >
          {s.nodeWithPortPoints.capacityMeshNodeId}
        </button>
      ))}
    </>
  )
}
