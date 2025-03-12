import type { GraphicsObject } from "graphics-debug"

// Define the profiling data structure
interface MethodProfile {
  calls: number
  totalTime: number
  className: string
}

// Define the profiler interface
interface SolverProfiler {
  _enabled?: boolean
  data: Record<string, MethodProfile>
  enable: () => void
  disable: () => void
  printTable: () => void
  reset: () => void
}

// Ensure the window object has the right type
declare global {
  interface Window {
    solverProfiling: SolverProfiler
  }
}

// Initialize the global profiler
console.log("hello")
if (typeof window !== "undefined" && !window.solverProfiling) {
  console.log("initializing solver profiling")
  window.solverProfiling = {
    data: {},
    enable: function () {
      this._enabled = true
    },
    disable: function () {
      this._enabled = false
    },
    _enabled: true,
    reset: function () {
      this.data = {}
    },
    printTable: function () {
      // Group by class name
      const classMethods: Record<
        string,
        Array<{ method: string; calls: number; totalTime: number }>
      > = {}

      // Process data into class groups
      Object.entries(this.data).forEach(([methodName, profile]) => {
        if (!classMethods[profile.className]) {
          classMethods[profile.className] = []
        }
        classMethods[profile.className].push({
          method: methodName.split(".")[1] || methodName,
          calls: profile.calls,
          totalTime: profile.totalTime,
        })
      })

      // Print table for each class
      Object.entries(classMethods).forEach(([className, methods]) => {
        console.group(`Profiling results for ${className}`)
        console.table(methods.sort((a, b) => b.totalTime - a.totalTime))

        // Calculate and display class totals
        const totalTime = methods.reduce(
          (sum, method) => sum + method.totalTime,
          0,
        )
        const totalCalls = methods.reduce(
          (sum, method) => sum + method.calls,
          0,
        )
        console.log(
          `Total time: ${totalTime.toFixed(2)}ms, Total calls: ${totalCalls}`,
        )
        console.groupEnd()
      })

      // Print overall summary
      const totalTimeAll = Object.values(this.data).reduce(
        (sum, profile) => sum + profile.totalTime,
        0,
      )
      const totalCallsAll = Object.values(this.data).reduce(
        (sum, profile) => sum + profile.calls,
        0,
      )
      console.log(
        `Overall totals - Time: ${totalTimeAll.toFixed(2)}ms, Calls: ${totalCallsAll}`,
      )
    },
  }
}

export class BaseSolver {
  MAX_ITERATIONS = 1000
  solved = false
  failed = false
  iterations = 0
  progress = 0
  error: string | null = null
  activeSubSolver?: BaseSolver | null
  failedSubSolvers?: BaseSolver[]
  timeToSolve?: number
  _isProfilingEnabled = false

  /** DO NOT OVERRIDE! Override _step() instead */
  step() {
    if (this.solved) return
    if (this.failed) return
    this.iterations++
    try {
      this._step()
    } catch (e) {
      this.error = `${this.constructor.name} error: ${e}`
      console.error(this.error)
      this.failed = true
      throw e
    }
    if (!this.solved && this.iterations > this.MAX_ITERATIONS) {
      this.error = `${this.constructor.name} did not converge`
      console.error(this.error)
      this.failed = true
    }
  }

  _step() {}

  solve() {
    const startTime = Date.now()
    while (!this.solved && !this.failed) {
      this.step()
    }
    const endTime = Date.now()
    this.timeToSolve = endTime - startTime
  }

  visualize(): GraphicsObject {
    return {
      lines: [],
      points: [],
      rects: [],
      circles: [],
    }
  }

  /**
   * Binds all methods of the instance to the profiler
   * Call this in the constructor of your derived class to enable profiling
   */
  bindToProfiler() {
    if (typeof window === "undefined" || !window.solverProfiling) {
      console.warn(
        "Profiler not available - solverProfiling not found on window",
      )
      return
    }

    this._isProfilingEnabled = true

    // Get all method names from the prototype chain
    const methodNames = new Set<string>()
    let proto = Object.getPrototypeOf(this)

    while (proto && proto !== Object.prototype) {
      Object.getOwnPropertyNames(proto)
        .filter((name) => {
          // Filter out non-methods and constructor
          const descriptor = Object.getOwnPropertyDescriptor(proto, name)
          return (
            descriptor &&
            typeof descriptor.value === "function" &&
            name !== "constructor" &&
            !name.startsWith("_")
          ) // Skip private methods starting with underscore
        })
        .forEach((name) => methodNames.add(name))

      proto = Object.getPrototypeOf(proto)
    }

    // Wrap each method with profiling code
    methodNames.forEach((methodName) => {
      const original = (this as any)[methodName]
      if (typeof original === "function") {
        const className = this.constructor.name
        const fullMethodName = `${className}.${methodName}`
        ;(this as any)[methodName] = function (...args: any[]) {
          // Skip profiling if disabled globally
          if (!window.solverProfiling._enabled) {
            return original.apply(this, args)
          }

          // Initialize profile data if it doesn't exist
          if (!window.solverProfiling.data[fullMethodName]) {
            window.solverProfiling.data[fullMethodName] = {
              calls: 0,
              totalTime: 0,
              className,
            }
          }

          // Start timing
          const start = performance.now()

          // Call the original method
          const result = original.apply(this, args)

          // End timing and update profile data
          const end = performance.now()
          const elapsed = end - start

          window.solverProfiling.data[fullMethodName].calls++
          window.solverProfiling.data[fullMethodName].totalTime += elapsed

          return result
        }
      }
    })
  }
}
