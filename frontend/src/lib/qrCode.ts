// @ts-nocheck — vendored verbatim from virya/src/lib/qrCode.ts, which is
// type-checked under virya's tsconfig; this repo adds noUncheckedIndexedAccess
// and adapting the encoder's ~30 index sites would fork it from upstream.
/**
 * Dependency-free QR encoder — vendored verbatim from virya/src/lib/qrCode.ts
 * (the staff print tool). One implementation, one set of QR bugs to fix.
 *
 * It chooses the smallest supported, well-tested QR profile that fits the URL:
 * version 11-M for normal concert links and version 15-M for unusually long
 * slugs. Smaller symbols have larger printed modules and scan more reliably.
 */

type BlockSpec = {
  count: number
  totalCodewords: number
  dataCodewords: number
}

type QrProfile = {
  version: number
  size: number
  dataCodewords: number
  totalCodewords: number
  errorCodewordsPerBlock: number
  alignmentPositions: readonly number[]
  maxBytePayload: number
  blocks: readonly BlockSpec[]
}

const PROFILES: readonly QrProfile[] = [
  {
    version: 11,
    size: 61,
    dataCodewords: 254,
    totalCodewords: 404,
    errorCodewordsPerBlock: 30,
    alignmentPositions: [6, 30, 54],
    maxBytePayload: 251,
    blocks: [
      { count: 1, totalCodewords: 80, dataCodewords: 50 },
      { count: 4, totalCodewords: 81, dataCodewords: 51 },
    ],
  },
  {
    version: 15,
    size: 77,
    dataCodewords: 415,
    totalCodewords: 655,
    errorCodewordsPerBlock: 24,
    alignmentPositions: [6, 26, 48, 70],
    maxBytePayload: 412,
    blocks: [
      { count: 5, totalCodewords: 65, dataCodewords: 41 },
      { count: 5, totalCodewords: 66, dataCodewords: 42 },
    ],
  },
]

const MAX_BYTE_PAYLOAD = PROFILES[PROFILES.length - 1].maxBytePayload

type Module = boolean | null

const GF_EXP = new Uint8Array(512)
const GF_LOG = new Uint8Array(256)

let fieldValue = 1
for (let index = 0; index < 255; index += 1) {
  GF_EXP[index] = fieldValue
  GF_LOG[fieldValue] = index
  fieldValue <<= 1
  if ((fieldValue & 0x100) !== 0) fieldValue ^= 0x11d
}
for (let index = 255; index < GF_EXP.length; index += 1) {
  GF_EXP[index] = GF_EXP[index - 255]
}

class BitBuffer {
  readonly bits: number[] = []

  append(value: number, length: number) {
    for (let bit = length - 1; bit >= 0; bit -= 1) {
      this.bits.push((value >>> bit) & 1)
    }
  }

  get length() {
    return this.bits.length
  }
}

export type GeneratedQr = {
  matrix: readonly (readonly boolean[])[]
  svg: string
  byteLength: number
  version: number
}

export function generateQr(value: string): GeneratedQr {
  const bytes = new TextEncoder().encode(value)
  if (bytes.length > MAX_BYTE_PAYLOAD) {
    throw new RangeError(
      `QR payload is ${bytes.length} bytes; the safe limit is ${MAX_BYTE_PAYLOAD}`,
    )
  }

  const profile = PROFILES.find(candidate => bytes.length <= candidate.maxBytePayload)
  if (!profile) throw new RangeError("QR payload exceeds supported profiles")

  const codewords = createCodewords(bytes, profile)
  let bestMatrix: boolean[][] | null = null
  let bestPenalty = Number.POSITIVE_INFINITY

  for (let mask = 0; mask < 8; mask += 1) {
    const candidate = createMatrix(codewords, mask, true, profile)
    const penalty = penaltyScore(candidate)
    if (penalty < bestPenalty) {
      bestPenalty = penalty
      bestMatrix = createMatrix(codewords, mask, false, profile)
    }
  }

  if (!bestMatrix) throw new Error("Could not select a QR mask")
  return {
    matrix: bestMatrix,
    svg: matrixToSvg(bestMatrix),
    byteLength: bytes.length,
    version: profile.version,
  }
}

export function matrixToSvg(matrix: readonly (readonly boolean[])[]) {
  const quiet = 4
  const dimension = matrix.length + quiet * 2
  const paths: string[] = []

  matrix.forEach((row, rowIndex) => {
    let column = 0
    while (column < row.length) {
      if (!row[column]) {
        column += 1
        continue
      }
      const start = column
      while (column < row.length && row[column]) column += 1
      const length = column - start
      paths.push(
        `M${start + quiet} ${rowIndex + quiet}h${length}v1h-${length}z`,
      )
    }
  })

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dimension} ${dimension}" role="img" aria-label="Kod QR" shape-rendering="crispEdges"><rect width="${dimension}" height="${dimension}" fill="#fff"/><path d="${paths.join("")}" fill="#000"/></svg>`
}

export function renderQrToCanvas(
  canvas: HTMLCanvasElement,
  matrix: readonly (readonly boolean[])[],
  pixels = 1020,
) {
  const quiet = 4
  const modules = matrix.length + quiet * 2
  const modulePixels = Math.max(1, Math.floor(pixels / modules))
  const size = modulePixels * modules
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext("2d")
  if (!context) throw new Error("Canvas is not available")
  context.imageSmoothingEnabled = false
  context.fillStyle = "#fff"
  context.fillRect(0, 0, size, size)
  context.fillStyle = "#000"
  matrix.forEach((row, rowIndex) => {
    row.forEach((dark, columnIndex) => {
      if (!dark) return
      context.fillRect(
        (columnIndex + quiet) * modulePixels,
        (rowIndex + quiet) * modulePixels,
        modulePixels,
        modulePixels,
      )
    })
  })
}

function createCodewords(bytes: Uint8Array, profile: QrProfile) {
  const buffer = new BitBuffer()
  buffer.append(0b0100, 4) // Byte mode.
  buffer.append(bytes.length, 16) // Version 10-26 byte count width.
  bytes.forEach(byte => buffer.append(byte, 8))

  const capacityBits = profile.dataCodewords * 8
  const terminator = Math.min(4, capacityBits - buffer.length)
  if (terminator > 0) buffer.append(0, terminator)
  while (buffer.length % 8 !== 0) buffer.append(0, 1)

  let pad = 0xec
  while (buffer.length < capacityBits) {
    buffer.append(pad, 8)
    pad = pad === 0xec ? 0x11 : 0xec
  }

  const data = new Uint8Array(profile.dataCodewords)
  for (let index = 0; index < data.length; index += 1) {
    let value = 0
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value << 1) | (buffer.bits[index * 8 + bit] ?? 0)
    }
    data[index] = value
  }

  const dataBlocks: Uint8Array[] = []
  const errorBlocks: Uint8Array[] = []
  let offset = 0
  for (const spec of profile.blocks) {
    for (let count = 0; count < spec.count; count += 1) {
      const block = data.slice(offset, offset + spec.dataCodewords)
      offset += spec.dataCodewords
      dataBlocks.push(block)
      errorBlocks.push(reedSolomonRemainder(block, profile.errorCodewordsPerBlock))
    }
  }
  if (offset !== profile.dataCodewords) throw new Error("Invalid QR block layout")

  const result: number[] = []
  const maxDataLength = Math.max(...dataBlocks.map(block => block.length))
  for (let index = 0; index < maxDataLength; index += 1) {
    dataBlocks.forEach(block => {
      if (index < block.length) result.push(block[index])
    })
  }
  for (let index = 0; index < profile.errorCodewordsPerBlock; index += 1) {
    errorBlocks.forEach(block => result.push(block[index]))
  }
  if (result.length !== profile.totalCodewords) {
    throw new Error("Invalid interleaved QR codeword count")
  }
  return Uint8Array.from(result)
}

function reedSolomonRemainder(data: Uint8Array, degree: number) {
  const generator = reedSolomonGenerator(degree)
  const working = new Uint8Array(data.length + degree)
  working.set(data)

  for (let index = 0; index < data.length; index += 1) {
    const factor = working[index]
    if (factor === 0) continue
    for (let term = 0; term < generator.length; term += 1) {
      working[index + term] ^= gfMultiply(generator[term], factor)
    }
  }
  return working.slice(data.length)
}

function reedSolomonGenerator(degree: number) {
  let polynomial = Uint8Array.of(1)
  for (let index = 0; index < degree; index += 1) {
    polynomial = polynomialMultiply(polynomial, Uint8Array.of(1, GF_EXP[index]))
  }
  return polynomial
}

function polynomialMultiply(left: Uint8Array, right: Uint8Array) {
  const result = new Uint8Array(left.length + right.length - 1)
  left.forEach((leftValue, leftIndex) => {
    right.forEach((rightValue, rightIndex) => {
      result[leftIndex + rightIndex] ^= gfMultiply(leftValue, rightValue)
    })
  })
  return result
}

function gfMultiply(left: number, right: number) {
  return left === 0 || right === 0
    ? 0
    : GF_EXP[GF_LOG[left] + GF_LOG[right]]
}

function createMatrix(
  codewords: Uint8Array,
  mask: number,
  test: boolean,
  profile: QrProfile,
): boolean[][] {
  const modules: Module[][] = Array.from({ length: profile.size }, () =>
    Array<Module>(profile.size).fill(null),
  )

  placeFinder(modules, 0, 0)
  placeFinder(modules, profile.size - 7, 0)
  placeFinder(modules, 0, profile.size - 7)
  placeAlignmentPatterns(modules, profile.alignmentPositions)
  placeTimingPatterns(modules)
  placeVersionInformation(modules, profile.version, test)
  placeFormatInformation(modules, mask, test)
  placeData(modules, codewords, mask)

  return modules.map(row => row.map(value => value === true))
}

function placeFinder(modules: Module[][], row: number, column: number) {
  for (let rowOffset = -1; rowOffset <= 7; rowOffset += 1) {
    for (let columnOffset = -1; columnOffset <= 7; columnOffset += 1) {
      const currentRow = row + rowOffset
      const currentColumn = column + columnOffset
      if (
        currentRow < 0 ||
        currentRow >= modules.length ||
        currentColumn < 0 ||
        currentColumn >= modules.length
      ) {
        continue
      }
      const dark =
        rowOffset >= 0 &&
        rowOffset <= 6 &&
        columnOffset >= 0 &&
        columnOffset <= 6 &&
        (rowOffset === 0 ||
          rowOffset === 6 ||
          columnOffset === 0 ||
          columnOffset === 6 ||
          (rowOffset >= 2 &&
            rowOffset <= 4 &&
            columnOffset >= 2 &&
            columnOffset <= 4))
      modules[currentRow][currentColumn] = dark
    }
  }
}

function placeAlignmentPatterns(
  modules: Module[][],
  positions: readonly number[],
) {
  positions.forEach(row => {
    positions.forEach(column => {
      if (modules[row][column] !== null) return
      for (let rowOffset = -2; rowOffset <= 2; rowOffset += 1) {
        for (let columnOffset = -2; columnOffset <= 2; columnOffset += 1) {
          modules[row + rowOffset][column + columnOffset] =
            Math.abs(rowOffset) === 2 ||
            Math.abs(columnOffset) === 2 ||
            (rowOffset === 0 && columnOffset === 0)
        }
      }
    })
  })
}

function placeTimingPatterns(modules: Module[][]) {
  for (let index = 8; index < modules.length - 8; index += 1) {
    if (modules[index][6] === null) modules[index][6] = index % 2 === 0
    if (modules[6][index] === null) modules[6][index] = index % 2 === 0
  }
}

function placeVersionInformation(
  modules: Module[][],
  version: number,
  test: boolean,
) {
  const size = modules.length
  const bits = bchVersion(version)
  for (let index = 0; index < 18; index += 1) {
    const dark = !test && ((bits >>> index) & 1) === 1
    modules[Math.floor(index / 3)][(index % 3) + size - 11] = dark
    modules[(index % 3) + size - 11][Math.floor(index / 3)] = dark
  }
}

function placeFormatInformation(
  modules: Module[][],
  mask: number,
  test: boolean,
) {
  const size = modules.length
  // Error correction level M has format value 0.
  const bits = bchFormat(mask)
  for (let index = 0; index < 15; index += 1) {
    const dark = !test && ((bits >>> index) & 1) === 1

    if (index < 6) modules[index][8] = dark
    else if (index < 8) modules[index + 1][8] = dark
    else modules[size - 15 + index][8] = dark

    if (index < 8) modules[8][size - index - 1] = dark
    else if (index === 8) modules[8][7] = dark
    else modules[8][15 - index - 1] = dark
  }
  modules[size - 8][8] = !test
}

function placeData(modules: Module[][], codewords: Uint8Array, mask: number) {
  const size = modules.length
  let row = size - 1
  let direction = -1
  let codewordIndex = 0
  let bitIndex = 7

  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right -= 1

    while (true) {
      for (let offset = 0; offset < 2; offset += 1) {
        const column = right - offset
        if (modules[row][column] !== null) continue
        let dark = false
        if (codewordIndex < codewords.length) {
          dark = ((codewords[codewordIndex] >>> bitIndex) & 1) === 1
        }
        if (maskAt(mask, row, column)) dark = !dark
        modules[row][column] = dark

        bitIndex -= 1
        if (bitIndex < 0) {
          codewordIndex += 1
          bitIndex = 7
        }
      }

      row += direction
      if (row >= 0 && row < size) continue
      row -= direction
      direction = -direction
      break
    }
  }
}

function maskAt(mask: number, row: number, column: number) {
  const product = row * column
  switch (mask) {
    case 0:
      return (row + column) % 2 === 0
    case 1:
      return row % 2 === 0
    case 2:
      return column % 3 === 0
    case 3:
      return (row + column) % 3 === 0
    case 4:
      return (Math.floor(row / 2) + Math.floor(column / 3)) % 2 === 0
    case 5:
      return (product % 2) + (product % 3) === 0
    case 6:
      return ((product % 2) + (product % 3)) % 2 === 0
    case 7:
      return ((product % 3) + ((row + column) % 2)) % 2 === 0
    default:
      throw new RangeError("Invalid QR mask")
  }
}

function bchFormat(value: number) {
  const generator = 0x537
  let result = value << 10
  while (bitLength(result) - bitLength(generator) >= 0) {
    result ^= generator << (bitLength(result) - bitLength(generator))
  }
  return ((value << 10) | result) ^ 0x5412
}

function bchVersion(value: number) {
  const generator = 0x1f25
  let result = value << 12
  while (bitLength(result) - bitLength(generator) >= 0) {
    result ^= generator << (bitLength(result) - bitLength(generator))
  }
  return (value << 12) | result
}

function bitLength(value: number) {
  let length = 0
  while (value !== 0) {
    length += 1
    value >>>= 1
  }
  return length
}

function penaltyScore(modules: readonly (readonly boolean[])[]) {
  const size = modules.length
  let score = 0

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const dark = modules[row][column]
      let neighbours = 0
      for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
        const currentRow = row + rowOffset
        if (currentRow < 0 || currentRow >= modules.length) continue
        for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
          if (rowOffset === 0 && columnOffset === 0) continue
          const currentColumn = column + columnOffset
          if (currentColumn < 0 || currentColumn >= modules.length) continue
          if (modules[currentRow][currentColumn] === dark) neighbours += 1
        }
      }
      if (neighbours > 5) score += 3 + neighbours - 5
    }
  }

  for (let row = 0; row < size - 1; row += 1) {
    for (let column = 0; column < size - 1; column += 1) {
      const total =
        Number(modules[row][column]) +
        Number(modules[row + 1][column]) +
        Number(modules[row][column + 1]) +
        Number(modules[row + 1][column + 1])
      if (total === 0 || total === 4) score += 3
    }
  }

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size - 6; column += 1) {
      if (
        modules[row][column] &&
        !modules[row][column + 1] &&
        modules[row][column + 2] &&
        modules[row][column + 3] &&
        modules[row][column + 4] &&
        !modules[row][column + 5] &&
        modules[row][column + 6]
      ) {
        score += 40
      }
    }
  }
  for (let column = 0; column < size; column += 1) {
    for (let row = 0; row < size - 6; row += 1) {
      if (
        modules[row][column] &&
        !modules[row + 1][column] &&
        modules[row + 2][column] &&
        modules[row + 3][column] &&
        modules[row + 4][column] &&
        !modules[row + 5][column] &&
        modules[row + 6][column]
      ) {
        score += 40
      }
    }
  }

  const darkCount = modules.reduce(
    (sum, row) => sum + row.reduce((rowSum, dark) => rowSum + Number(dark), 0),
    0,
  )
  score += Math.floor(Math.abs((100 * darkCount) / (size * size) - 50) / 5) * 10
  return score
}
