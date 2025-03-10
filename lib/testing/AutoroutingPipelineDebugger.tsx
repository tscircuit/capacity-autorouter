import { useState, useEffect, useMemo } from "react"
import { InteractiveGraphics } from "graphics-debug/react"
import { BaseSolver } from "lib/solvers/BaseSolver"
import { combineVisualizations } from "lib/utils/combineVisualizations"
import { SimpleRouteJson } from "lib/types"
import { CapacityMeshSolver } from "lib/solvers/AutoroutingPipelineSolver"
import { GraphicsObject, Rect } from "graphics-debug"

interface CapacityMeshPipelineDebuggerProps {
  srj: SimpleRouteJson
  animationSpeed?: number
}

const createSolver = (srj: SimpleRouteJson) => {
  return new CapacityMeshSolver(srj)
}

export const CapacityMeshPipelineDebugger = ({
  srj,
  animationSpeed = 10,
}: CapacityMeshPipelineDebuggerProps) => {
  const [solver, setSolver] = useState<CapacityMeshSolver>(() =>
    createSolver(srj),
  )
  const [canSelectObjects, setCanSelectObjects] = useState(false)
  const [, setForceUpdate] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)
  const [speedLevel, setSpeedLevel] = useState(0)
  const [dialogObject, setDialogObject] = useState<Rect | null>(null)
  const [lastTargetIteration, setLastTargetIteration] = useState<number>(
    parseInt(window.localStorage.getItem("lastTargetIteration") || "0", 10),
  )

  const speedLevels = [1, 2, 5, 10, 100]
  const speedLabels = ["1x", "2x", "5x", "10x", "100x"]

  // Reset solver
  const resetSolver = () => {
    setSolver(createSolver(srj))
  }

  // Animation effect
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined

    if (isAnimating && !solver.solved && !solver.failed) {
      intervalId = setInterval(() => {
        const stepsPerInterval = speedLevels[speedLevel]

        for (let i = 0; i < stepsPerInterval; i++) {
          if (solver.solved || solver.failed) {
            break
          }
          solver.step()
        }
        setForceUpdate((prev) => prev + 1)
      }, animationSpeed)
    }

    return () => {
      if (intervalId !== undefined) {
        clearInterval(intervalId)
      }
    }
  }, [isAnimating, speedLevel, solver, animationSpeed])

  // Manual step function
  const handleStep = () => {
    if (!solver.solved && !solver.failed) {
      solver.step()
      setForceUpdate((prev) => prev + 1)
    }
  }

  // Next Stage function
  const handleNextStage = () => {
    if (!solver.solved && !solver.failed) {
      const initialSubSolver = solver.activeSubSolver

      // Step until we get a new subsolver (null -> something)
      if (initialSubSolver === null) {
        while (
          !solver.solved &&
          !solver.failed &&
          solver.activeSubSolver === null
        ) {
          solver.step()
        }
      }

      // Now step until the subsolver completes (something -> null)
      if (solver.activeSubSolver !== null) {
        while (
          !solver.solved &&
          !solver.failed &&
          solver.activeSubSolver !== null
        ) {
          solver.step()
        }
      }

      setForceUpdate((prev) => prev + 1)
    }
  }

  // Solve completely
  const handleSolveCompletely = () => {
    if (!solver.solved && !solver.failed) {
      solver.solve()
      setForceUpdate((prev) => prev + 1)
    }
  }

  // Go to specific iteration
  const handleGoToIteration = () => {
    if (solver.solved || solver.failed) {
      return
    }

    const targetIteration = window.prompt(
      "Enter target iteration number:",
      lastTargetIteration.toString(),
    )

    if (targetIteration === null) {
      return // User canceled the dialog
    }

    const target = parseInt(targetIteration, 10)

    if (Number.isNaN(target) || target < 0) {
      alert("Please enter a valid positive number")
      return
    }

    setLastTargetIteration(target)
    window.localStorage.setItem("lastTargetIteration", target.toString())

    // If we're already past the target, we need to reset and start over
    if (solver.iterations > target) {
      const newSolver = createSolver(srj)
      setSolver(newSolver)

      // Now run until we reach the target
      while (
        newSolver.iterations < target &&
        !newSolver.solved &&
        !newSolver.failed
      ) {
        newSolver.step()
      }
    } else {
      // We just need to run until we reach the target
      while (solver.iterations < target && !solver.solved && !solver.failed) {
        solver.step()
      }
    }

    setForceUpdate((prev) => prev + 1)
  }

  // Increase animation speed
  const increaseSpeed = () => {
    setSpeedLevel((prev) => Math.min(prev + 1, speedLevels.length - 1))
    if (!isAnimating) {
      setIsAnimating(true)
    }
  }

  // Decrease animation speed
  const decreaseSpeed = () => {
    setSpeedLevel((prev) => Math.max(prev - 1, 0))
  }

  // Safely get visualization
  const visualization = useMemo(() => {
    try {
      return solver?.visualize() || { points: [], lines: [] }
    } catch (error) {
      console.error("Visualization error:", error)
      return { points: [], lines: [] }
    }
  }, [solver, solver.iterations])

  return (
    <div className="p-4">
      <div className="flex gap-2 mb-4">
        <button
          className="border rounded-md p-2 hover:bg-gray-100"
          onClick={handleStep}
          disabled={solver.solved || solver.failed}
        >
          Step
        </button>
        <button
          className="border rounded-md p-2 hover:bg-gray-100"
          onClick={handleNextStage}
          disabled={solver.solved || solver.failed}
        >
          Next Stage
        </button>
        <button
          className="border rounded-md p-2 hover:bg-gray-100"
          onClick={() => setIsAnimating(!isAnimating)}
          disabled={solver.solved || solver.failed}
        >
          {isAnimating ? "Stop" : "Animate"}
        </button>
        <button
          className="border rounded-md p-2 hover:bg-gray-100"
          onClick={decreaseSpeed}
          disabled={speedLevel === 0 || solver.solved || solver.failed}
        >
          Slower
        </button>
        <button
          className="border rounded-md p-2 hover:bg-gray-100 min-w-[80px]"
          onClick={increaseSpeed}
          disabled={
            speedLevel === speedLevels.length - 1 ||
            solver.solved ||
            solver.failed
          }
        >
          {speedLabels[speedLevel + 1] ?? "(Max)"}
        </button>
        <button
          className="border rounded-md p-2 hover:bg-gray-100"
          onClick={handleSolveCompletely}
          disabled={solver.solved || solver.failed}
        >
          Solve Completely
        </button>
        <button
          className="border rounded-md p-2 hover:bg-gray-100"
          onClick={resetSolver}
        >
          Reset
        </button>
        <button
          className="border rounded-md p-2 hover:bg-gray-100"
          onClick={() => setCanSelectObjects(!canSelectObjects)}
        >
          {canSelectObjects ? "Disable" : "Enable"} Object Selection
        </button>
      </div>

      <div className="flex gap-4 mb-4 tabular-nums">
        <div className="border p-2 rounded flex items-center">
          Iterations:{" "}
          <span className="font-bold ml-1">{solver.iterations}</span>
          <button
            className="ml-2 border rounded-md px-2 py-1 text-sm hover:bg-gray-100"
            onClick={handleGoToIteration}
            disabled={solver.solved || solver.failed}
            title={
              lastTargetIteration > 0
                ? `Last: ${lastTargetIteration}`
                : "Go to specific iteration"
            }
          >
            Go to Iteration
          </button>
        </div>
        <div className="border p-2 rounded">
          Status:{" "}
          <span
            className={`font-bold ${solver.solved ? "text-green-600" : solver.failed ? "text-red-600" : "text-blue-600"}`}
          >
            {solver.solved ? "Solved" : solver.failed ? "Failed" : "No Errors"}
          </span>
        </div>
        {solver.activeSubSolver && (
          <div className="border p-2 rounded">
            Active Stage:{" "}
            <span className="font-bold">
              {solver.activeSubSolver.constructor.name}
            </span>
          </div>
        )}
        {solver.error && (
          <div className="border p-2 rounded bg-red-100">
            Error: <span className="font-bold">{solver.error}</span>
          </div>
        )}
      </div>

      <div className="border rounded-md p-4 mb-4">
        <InteractiveGraphics
          graphics={visualization}
          onObjectClicked={({ object }) => {
            if (!canSelectObjects) return
            if (!object.label?.includes("cn")) return
            setDialogObject(object)
          }}
        />
      </div>

      {dialogObject && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded-lg shadow-lg max-w-3xl max-h-[80vh] overflow-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg">
                Selected Object "{dialogObject.label?.split("\n")[0]}" (step{" "}
                {dialogObject.step})
              </h3>
              <button
                className="text-gray-500 hover:text-gray-700"
                onClick={() => setDialogObject(null)}
              >
                ✕
              </button>
            </div>
            <div>
              {dialogObject && (
                <div className="mb-4">
                  <pre className="bg-gray-100 p-3 rounded overflow-auto max-h-96 text-sm">
                    {dialogObject.label}
                  </pre>
                  <button
                    className="mt-2 bg-blue-500 hover:bg-blue-600 text-white py-1 px-3 rounded text-sm"
                    onClick={() => {
                      if (dialogObject?.label) {
                        // Extract the capacity mesh node ID from the label
                        const match = dialogObject.label.match(/cn(\d+)/)
                        if (match?.[1]) {
                          const nodeId = `cn${parseInt(match[1], 10)}`

                          // Find the node in the solver's data
                          let nodeData = null

                          if (solver.nodeTargetMerger?.newNodes) {
                            nodeData = solver.nodeTargetMerger.newNodes.find(
                              (n) => n.capacityMeshNodeId === nodeId,
                            )
                          } else if (solver.nodeSolver?.finishedNodes) {
                            nodeData = solver.nodeSolver.finishedNodes.find(
                              (n) => n.capacityMeshNodeId === nodeId,
                            )
                          }

                          // Get the node with port points from the segmentToPointOptimizer
                          let nodeWithPortPoints = null
                          if (
                            solver.unravelMultiSectionSolver
                              ?.getNodesWithPortPoints
                          ) {
                            nodeWithPortPoints = solver
                              .unravelMultiSectionSolver!.getNodesWithPortPoints()
                              .find((n) => n.capacityMeshNodeId === nodeId)
                          }

                          const dataToDownload = {
                            nodeId,
                            capacityMeshNode: nodeData,
                            nodeWithPortPoints: nodeWithPortPoints,
                          }

                          const dataStr = JSON.stringify(
                            dataToDownload,
                            null,
                            2,
                          )
                          const dataBlob = new Blob([dataStr], {
                            type: "application/json",
                          })
                          const url = URL.createObjectURL(dataBlob)
                          const a = document.createElement("a")
                          a.href = url
                          a.download = `${nodeId}-nodeWithPortPoints.json`
                          document.body.appendChild(a)
                          a.click()
                          document.body.removeChild(a)
                          URL.revokeObjectURL(url)
                        }
                      }
                    }}
                  >
                    Download High Density Node Input (NodeWithPortPoints)
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 border-t pt-4">
        <h3 className="font-bold mb-2">Pipeline Steps</h3>
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-2 text-left">Step</th>
              <th className="border p-2 text-left">Status</th>
              <th className="border p-2 text-left">Iterations</th>
              <th className="border p-2 text-left">Time</th>
              <th className="border p-2 text-left">Input</th>
            </tr>
          </thead>
          <tbody>
            {solver.pipelineDef?.map((step) => {
              const stepSolver = solver[
                step.solverName as keyof CapacityMeshSolver
              ] as BaseSolver | undefined
              const status = stepSolver?.solved
                ? "Solved"
                : stepSolver?.failed
                  ? "Failed"
                  : stepSolver
                    ? "In Progress"
                    : "Not Started"
              const statusClass = stepSolver?.solved
                ? "text-green-600"
                : stepSolver?.failed
                  ? "text-red-600"
                  : "text-blue-600"

              return (
                <tr key={step.solverName}>
                  <td className="border p-2">{step.solverName}</td>
                  <td className={`border p-2 font-bold ${statusClass}`}>
                    {status}
                  </td>
                  <td className="border p-2">{stepSolver?.iterations || 0}</td>
                  <td className="border p-2 tabular-nums">
                    {(
                      ((solver.endTimeOfPhase[step.solverName] ??
                        performance.now()) -
                        (solver.startTimeOfPhase[step.solverName] ??
                          performance.now())) /
                      1000
                    ).toFixed(2)}
                  </td>
                  <td className="border p-2">
                    <button
                      className="text-blue-600 hover:underline"
                      onClick={() => {
                        // Get the constructor parameters for this step
                        const params = step.getConstructorParams(solver)
                        // Recursively replace _parent: { ... } with _parent: { capacityMeshNodeId: "..." }
                        // This prevents circular references in the JSON
                        const replaceParent = (obj: any) => {
                          if (obj && typeof obj === "object") {
                            if (obj._parent) {
                              obj._parent = {
                                capacityMeshNodeId:
                                  obj._parent.capacityMeshNodeId,
                              }
                            }

                            // Recursively process all properties
                            for (const key in obj) {
                              if (
                                Object.prototype.hasOwnProperty.call(obj, key)
                              ) {
                                replaceParent(obj[key])
                              }
                            }

                            // Handle arrays
                            if (Array.isArray(obj)) {
                              obj.forEach((item) => replaceParent(item))
                            }
                          }
                        }
                        replaceParent(params[0])

                        // Create a JSON string with proper formatting
                        const paramsJson = JSON.stringify(params, null, 2)
                        // Create a blob with the JSON data
                        const blob = new Blob([paramsJson], {
                          type: "application/json",
                        })
                        // Create a URL for the blob
                        const url = URL.createObjectURL(blob)
                        // Create a temporary anchor element
                        const a = document.createElement("a")
                        // Set the download filename to the solver name
                        a.download = `${step.solverName}_input.json`
                        a.href = url
                        // Trigger the download
                        a.click()
                        // Clean up by revoking the URL
                        URL.revokeObjectURL(url)
                      }}
                      disabled={!stepSolver}
                    >
                      ⬇️ Input
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
