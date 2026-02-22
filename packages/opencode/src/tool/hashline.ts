const HASH_NIBBLES = "ZPMQVRWSNKTXJBYH"

const HASH_DICT = Array.from({ length: 256 }, (_, i) => {
  const high = i >>> 4
  const low = i & 0x0f
  return `${HASH_NIBBLES[high]}${HASH_NIBBLES[low]}`
})

const HASHLINE_LINE_RE = /^\s*(?:>>>|>>)?\s*(\d+)#([A-Z]{2}):(.*)$/

function normalizeForHash(line: string): string {
  const normalized = line.endsWith("\r") ? line.slice(0, -1) : line
  return normalized.replace(/\s+/g, "")
}

export function computeHashline(line: number, content: string): string {
  void line
  return HASH_DICT[Bun.hash.xxHash32(normalizeForHash(content)) & 0xff]
}

export function formatHashline(line: number, content: string): string {
  return `${line}#${computeHashline(line, content)}:${content}`
}

type Parsed = { line: number; hash: string }

function parseHashline(line: string): Parsed | undefined {
  const match = line.match(HASHLINE_LINE_RE)
  if (!match) return
  const number = Number.parseInt(match[1], 10)
  if (!Number.isFinite(number) || number < 1) return
  return { line: number, hash: match[2] }
}

export function resolveHashlineOldString(oldString: string, fileContent: string): string {
  const rows = oldString.split("\n")
  const parsed = rows.map(parseHashline)
  const parsedCount = parsed.filter(Boolean).length
  if (parsedCount === 0) return oldString
  if (parsedCount !== rows.length) {
    throw new Error(
      "Invalid hashline oldString format. Use either plain text or full hashline format (`LINE#ID:content`) for every line.",
    )
  }

  const refs = parsed as Parsed[]
  for (let i = 1; i < refs.length; i++) {
    if (refs[i].line !== refs[i - 1].line + 1) {
      throw new Error("Hashline oldString must use contiguous line references in ascending order.")
    }
  }

  const lines = fileContent.split("\n")
  for (const ref of refs) {
    const idx = ref.line - 1
    const line = lines[idx]
    if (line === undefined) {
      throw new Error(`Hashline reference ${ref.line}#${ref.hash} is out of range for this file.`)
    }
    const actual = computeHashline(ref.line, line)
    if (actual !== ref.hash) {
      throw new Error(
        `Hashline mismatch at ${ref.line}#${ref.hash}; current line hash is ${actual}. Re-read the file and retry with updated references.`,
      )
    }
  }

  return refs.map((ref) => lines[ref.line - 1]).join("\n")
}

export function stripHashlinePrefixes(input: string): string {
  const rows = input.split("\n")
  const stripped = rows.map((row) => {
    const match = row.match(HASHLINE_LINE_RE)
    if (!match) return row
    return match[3]
  })

  const changed = stripped.some((row, index) => row !== rows[index])
  if (!changed) return input
  return stripped.join("\n")
}

export function isHashlineEditEnabled(config?: { experimental?: { hashline_edit?: boolean } }): boolean {
  const env = process.env["OPENCODE_EXPERIMENTAL_HASHLINE_EDIT"]?.toLowerCase()
  if (env === "true" || env === "1") return true
  if (env === "false" || env === "0") return false
  return config?.experimental?.hashline_edit === true
}
