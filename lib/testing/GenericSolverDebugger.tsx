import { useState, useEffect, useMemo } from "react"
import { InteractiveGraphics } from "graphics-debug/react"
import { BaseSolver } from "lib/solvers/BaseSolver"
import { combineVisualizations } from "lib/utils/combineVisualizations"

interface GenericSolverDebuggerProps {
  createSolver: () => BaseSolver
  animationSpeed?: number
}

export const GenericSolverDebugger = ({
  createSolver,
  animationSpeed = 10,
}: GenericSolverDebuggerProps) => {
  const [mainSolver, setMainSolver] = useState<BaseSolver>(() => createSolver())
  const [forcedUpdates, setForceUpdate] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)
  const [speedLevel, setSpeedLevel] = useState(0)
  const [selectedSolverKey, setSelectedSolverKey] = useState<"main" | number>(
    "main",
  )

  const selectedSolver = useMemo(() => {
    if (selectedSolverKey === "main") {
      return mainSolver
    } else if (
      mainSolver.failedSubSolvers &&
      mainSolver.failedSubSolvers.length > selectedSolverKey
    ) {
      return mainSolver.failedSubSolvers[selectedSolverKey]
    }
  }, [mainSolver, selectedSolverKey])

  const speedLevels = [1, 2, 5, 10, 100]
  const speedLabels = ["1x", "2x", "5x", "10x", "100x"]

  // Reset solver
  const resetSolver = () => {
    setMainSolver(createSolver())
    setSelectedSolverKey("main")
  }

  // Animation effect
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined

    if (isAnimating && !mainSolver.solved && !mainSolver.failed) {
      intervalId = setInterval(() => {
        const stepsPerInterval = speedLevels[speedLevel]

        for (let i = 0; i < stepsPerInterval; i++) {
          if (mainSolver.solved || mainSolver.failed) {
            break
          }
          mainSolver.step()
        }
        setForceUpdate((prev) => prev + 1)
      }, animationSpeed)
    }

    return () => {
      if (intervalId !== undefined) {
        clearInterval(intervalId)
      }
    }
  }, [isAnimating, speedLevel, mainSolver, animationSpeed])

  // Manual step function
  const handleStep = () => {
    if (!mainSolver.solved && !mainSolver.failed) {
      mainSolver.step()
      setForceUpdate((prev) => prev + 1)
    }
  }

  // Next Stage function
  const handleNextStage = () => {
    if (!mainSolver.solved && !mainSolver.failed) {
      const initialSubSolver = mainSolver.activeSubSolver

      // Step until we get a new subsolver (null -> something)
      if (initialSubSolver === null) {
        while (
          !mainSolver.solved &&
          !mainSolver.failed &&
          mainSolver.activeSubSolver === null
        ) {
          mainSolver.step()
        }
      }

      // Now step until the subsolver completes (something -> null)
      if (mainSolver.activeSubSolver !== null) {
        while (
          !mainSolver.solved &&
          !mainSolver.failed &&
          mainSolver.activeSubSolver !== null
        ) {
          mainSolver.step()
        }
      }

      setForceUpdate((prev) => prev + 1)
    }
  }

  // Solve completely
  const handleSolveCompletely = () => {
    if (!mainSolver.solved && !mainSolver.failed) {
      mainSolver.solve()
      setForceUpdate((prev) => prev + 1)
    }
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
      return selectedSolver?.visualize() || { points: [], lines: [] }
    } catch (error) {
      console.error("Visualization error:", error)
      return { points: [], lines: [] }
    }
  }, [forcedUpdates, selectedSolver])

  // Generate solver options for dropdown
  const solverOptions = useMemo(() => {
    const options = [
      {
        value: "main" as string | number,
        label: `Main Solver (${mainSolver.constructor.name})`,
      },
    ]

    if (mainSolver.failedSubSolvers && mainSolver.failedSubSolvers.length > 0) {
      mainSolver.failedSubSolvers.forEach((subSolver, index) => {
        options.push({
          value: index,
          label: `Failed Solver ${index + 1} (${subSolver.constructor.name})`,
        })
      })
    }

    return options
  }, [forcedUpdates, mainSolver, mainSolver.failedSubSolvers?.length])

  return (
    <div className="p-4">
      <div className="flex gap-2 mb-4">
        <button
          className="border rounded-md p-2 hover:bg-gray-100"
          onClick={handleStep}
          disabled={mainSolver.solved || mainSolver.failed}
        >
          Step
        </button>
        <button
          className="border rounded-md p-2 hover:bg-gray-100"
          onClick={handleNextStage}
          disabled={mainSolver.solved || mainSolver.failed}
        >
          Next Stage
        </button>
        <button
          className="border rounded-md p-2 hover:bg-gray-100"
          onClick={() => setIsAnimating(!isAnimating)}
          disabled={mainSolver.solved || mainSolver.failed}
        >
          {isAnimating ? "Stop" : "Animate"}
        </button>
        <button
          className="border rounded-md p-2 hover:bg-gray-100"
          onClick={decreaseSpeed}
          disabled={speedLevel === 0 || mainSolver.solved || mainSolver.failed}
        >
          Slower
        </button>
        <button
          className="border rounded-md p-2 hover:bg-gray-100 min-w-[80px]"
          onClick={increaseSpeed}
          disabled={
            speedLevel === speedLevels.length - 1 ||
            mainSolver.solved ||
            mainSolver.failed
          }
        >
          {speedLabels[speedLevel + 1] ?? "(Max)"}
        </button>
        <button
          className="border rounded-md p-2 hover:bg-gray-100"
          onClick={handleSolveCompletely}
          disabled={mainSolver.solved || mainSolver.failed}
        >
          Solve Completely
        </button>
        <button
          className="border rounded-md p-2 hover:bg-gray-100"
          onClick={resetSolver}
        >
          Reset
        </button>
      </div>

      <div className="flex gap-4 mb-4 tabular-nums">
        <div className="border p-2 rounded">
          Iterations: <span className="font-bold">{mainSolver.iterations}</span>
        </div>
        <div className="border p-2 rounded">
          Status:{" "}
          <span
            className={`font-bold ${mainSolver.solved ? "text-green-600" : mainSolver.failed ? "text-red-600" : "text-blue-600"}`}
          >
            {mainSolver.solved
              ? "Solved"
              : mainSolver.failed
                ? "Failed"
                : "No Errors"}
          </span>
        </div>
        {mainSolver.activeSubSolver && (
          <div className="border p-2 rounded">
            Active Stage:{" "}
            <span className="font-bold">
              {mainSolver.activeSubSolver.constructor.name}
            </span>
          </div>
        )}
        {mainSolver.timeToSolve !== undefined && (
          <div className="border p-2 rounded">
            Time to solve:{" "}
            <span className="font-bold">
              {(mainSolver.timeToSolve / 1000).toFixed(2)}s
            </span>
          </div>
        )}
        {solverOptions.length > 1 && (
          <div>
            <select
              className="border rounded-md p-2 w-full max-w-md"
              value={selectedSolverKey.toString()}
              onChange={(e) =>
                setSelectedSolverKey(
                  e.target.value === "main" ? "main" : parseInt(e.target.value),
                )
              }
            >
              {solverOptions.map((option) => (
                <option
                  key={option.value.toString()}
                  value={option.value.toString()}
                >
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}
        {mainSolver.error && (
          <div className="border p-2 rounded bg-red-100">
            Error: <span className="font-bold">{mainSolver.error}</span>
          </div>
        )}
      </div>

      <div className="border rounded-md p-4 mb-4">
        <InteractiveGraphics graphics={visualization} />
      </div>

      <div className="mt-4 border-t pt-4">
        <h3 className="font-bold mb-2">Solver Information</h3>
        <div className="border p-2 rounded mb-2">
          Type:{" "}
          <span className="font-bold">{selectedSolver?.constructor.name}</span>
        </div>
        <div className="border p-2 rounded mb-2">
          Max Iterations:{" "}
          <span className="font-bold">{selectedSolver?.MAX_ITERATIONS}</span>
        </div>
      </div>
    </div>
  )
}
