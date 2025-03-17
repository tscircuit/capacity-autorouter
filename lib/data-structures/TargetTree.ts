interface Target {
  x: number
  y: number
  bounds: {
    minX: number
    minY: number
    maxX: number
    maxY: number
  }
  connectionName: string
  availableZ: number[]
}

export type BucketCoordinate = `${number}x${number}`

export class TargetTree {
  buckets: Map<BucketCoordinate, [Target, number][]>
  CELL_SIZE = 5

  constructor(public targets: Target[]) {
    this.buckets = new Map()
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i]
      const targetMinX = target.bounds.minX
      const targetMinY = target.bounds.minY
      const targetMaxX = target.bounds.maxX
      const targetMaxY = target.bounds.maxY
      for (let x = targetMinX; x <= targetMaxX; x += this.CELL_SIZE) {
        for (let y = targetMinY; y <= targetMaxY; y += this.CELL_SIZE) {
          const bucketKey = this.getBucketKey(x, y)
          const bucket = this.buckets.get(bucketKey)
          if (!bucket) {
            this.buckets.set(bucketKey, [[target, i]])
          } else {
            bucket.push([target, i])
          }
        }
      }
    }
  }

  getBucketKey(x: number, y: number): BucketCoordinate {
    return `${Math.floor(x / this.CELL_SIZE)}x${Math.floor(y / this.CELL_SIZE)}`
  }

  getTargetsInArea(
    centerX: number,
    centerY: number,
    width: number,
    height: number,
  ): Target[] {
    const targets: Target[] = []
    const alreadyAddedTargets = new Set<number>()
    const minX = centerX - width / 2
    const minY = centerY - height / 2
    const maxX = centerX + width / 2
    const maxY = centerY + height / 2
    for (let x = minX; x <= maxX; x += this.CELL_SIZE) {
      for (let y = minY; y <= maxY; y += this.CELL_SIZE) {
        const bucketKey = this.getBucketKey(x, y)
        const bucket = this.buckets.get(bucketKey) || []
        for (const targetWithIndex of bucket) {
          if (alreadyAddedTargets.has(targetWithIndex[1])) continue
          alreadyAddedTargets.add(targetWithIndex[1])
          targets.push(targetWithIndex[0])
        }
      }
    }
    return targets
  }
}
