// Runs an isolated skill matching eval using local prompts and cache.
// Writes results to a local markdown report for review.
// Uses max-score matching with a higher threshold for stricter validation.
import { Database } from "bun:sqlite"
import { readdir } from "node:fs/promises"
import { join } from "node:path"

type Embedder = (input: string, options?: { pooling: "mean"; normalize: true }) => Promise<{ data: Float32Array }>

const ROOT_DIR = join(import.meta.dir, "..")
const PROMPTS_PATH = join(process.cwd(), "PROMPTS.md")
const RESULTS_PATH = join(ROOT_DIR, "loop", "results.md")
const CACHE_DB = join(ROOT_DIR, "eval", "skill-eval.db")
const SKILL_DIR = join(process.cwd(), "skill")
const THRESHOLD = process.env.OC_THRESHOLD ? Number.parseFloat(process.env.OC_THRESHOLD) : 0.5
const TOP = 5
const EMBED_OPTIONS = { pooling: "mean", normalize: true } as const

interface SkillRef {
  name: string
  content: string
}

interface Skill {
  name: string
  description: string
  body: string
  references: SkillRef[]
  source: "local" | "global"
}

interface SkillEmbedding {
  desc: number[]
  chunks: Array<{ ref: string; idx: number; embedding: number[] }>
  skill: Skill
}

interface Match {
  name: string
  score: number
  via: string
}

async function run() {
  await resetCache()
  const prompts = await loadPrompts()
  const skills = await loadAllSkills()
  const embedder = await loadEmbedder()
  const cache = createCache(CACHE_DB)
  const embeddings = await embedAllSkills(skills, embedder, cache)

  const blocks: string[] = []
  blocks.push(`# Skill Eval (threshold ${THRESHOLD})`)
  let passed = 0
  let failed = 0

  for (const prompt of prompts) {
    const queryEmbed = await embedQuery(prompt, embedder)
    const matches = rankMax(queryEmbed, embeddings)
    const block = renderBlock(prompt, matches)
    if (block.startsWith("## ")) {
      const statusLine = block.split("\n")[1] ?? ""
      if (statusLine.includes("PASS")) passed++
      if (statusLine.includes("FAIL")) failed++
    }
    blocks.push(block)
  }

  await Bun.write(RESULTS_PATH, blocks.join("\n\n") + "\n")
  console.log(`Eval complete. PASS: ${passed}, FAIL: ${failed}`)
  console.log(
    `Next: read ${RESULTS_PATH} and surgically edit skill frontmatter descriptions in ${SKILL_DIR} to improve scores.`,
  )
  cache.close()
}

async function loadPrompts(): Promise<string[]> {
  const file = Bun.file(PROMPTS_PATH)
  if (!(await file.exists())) {
    throw new Error(`Missing prompt file: ${PROMPTS_PATH}`)
  }
  const raw = await file.text()
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter((line) => line.length > 0)
}

async function loadEmbedder(): Promise<Embedder> {
  const mod = await import("@xenova/transformers")
  const pipeline = mod.pipeline as (task: string, model: string) => Promise<Embedder>
  return pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2")
}

async function loadAllSkills(): Promise<Skill[]> {
  return loadSkillsFromDir(SKILL_DIR, "global")
}

async function loadSkillsFromDir(dir: string, source: "local" | "global"): Promise<Skill[]> {
  const skills: Skill[] = []
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const skillPath = join(dir, entry.name, "SKILL.md")
      const file = Bun.file(skillPath)
      if (!(await file.exists())) continue

      const content = await file.text()
      const { description, body } = parseSkillFile(content)

      const references: SkillRef[] = []
      const refsDir = join(dir, entry.name, "references")
      try {
        const refEntries = await readdir(refsDir)
        for (const refFile of refEntries) {
          if (!refFile.endsWith(".md")) continue
          const refPath = join(refsDir, refFile)
          const refContent = await Bun.file(refPath).text()
          references.push({ name: refFile.replace(".md", ""), content: refContent })
        }
      } catch {
        // No references folder
      }

      skills.push({ name: entry.name, description, body, references, source })
    }
  } catch {
    // Directory doesn't exist
  }

  return skills
}

function parseSkillFile(content: string): { description: string; body: string } {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
  if (!fmMatch?.[1]) return { description: "", body: content }

  const frontmatter = fmMatch[1]
  // Extract body if it exists, otherwise empty string
  const bodyMatch = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/)
  const body = bodyMatch?.[1]?.trim() ?? ""

  const descMatch = frontmatter.match(/description:\s*\|?\-?\n?([\s\S]*?)(?=\n\w|$)/)
  const description = descMatch?.[1]?.trim().replace(/\n\s+/g, " ") ?? ""

  return { description, body }
}

async function resetCache(): Promise<void> {
  const fs = await import("node:fs/promises")
  await fs.rm(CACHE_DB, { force: true })
}

async function embedAllSkills(skills: Skill[], embedder: Embedder, cache: Cache): Promise<Map<string, SkillEmbedding>> {
  const embeddings = new Map<string, SkillEmbedding>()

  for (const skill of skills) {
    const desc = await embed(skill.description.slice(0, 500), embedder, cache, `${skill.name}:desc`)
    embeddings.set(skill.name, { desc, chunks: [], skill })
  }

  return embeddings
}

async function embedQuery(query: string, embedder: Embedder): Promise<number[]> {
  const result = (await embedder(query, EMBED_OPTIONS as any)) as { data: Float32Array }
  return Array.from(result.data)
}

async function embed(text: string, embedder: Embedder, cache: Cache, key: string): Promise<number[]> {
  const hash = contentHash(text)
  const cached = cache.get(key, hash)
  if (cached) return cached

  const result = (await embedder(text, EMBED_OPTIONS as any)) as { data: Float32Array }
  const arr = Array.from(result.data)
  cache.set(key, hash, arr)
  return arr
}

function rankMax(query: number[], embeddings: Map<string, SkillEmbedding>): Match[] {
  const matches: Match[] = []

  for (const emb of embeddings.values()) {
    const score = cosineSimilarity(query, emb.desc)
    matches.push({ name: emb.skill.name, score, via: "desc" })
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, TOP)
}

function renderBlock(prompt: string, matches: Match[]): string {
  const lines = [`## ${prompt}`]
  const best = matches[0]
  if (!best || best.score < THRESHOLD) {
    lines.push(`- Status: FAIL (best ${best ? best.score.toFixed(2) : "-"})`)
  } else {
    lines.push(`- Status: PASS (best ${best.score.toFixed(2)})`)
  }
  for (const match of matches) {
    const status = match.score >= THRESHOLD ? "PASS" : "LOW"
    lines.push(`- ${status} ${match.name} ${match.score.toFixed(2)} ${match.via}`)
  }
  return lines.join("\n")
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let mA = 0
  let mB = 0
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!
    const bi = b[i]!
    dot += ai * bi
    mA += ai * ai
    mB += bi * bi
  }
  return dot / (Math.sqrt(mA) * Math.sqrt(mB))
}

function contentHash(content: string): string {
  return Bun.hash(content).toString(16)
}

type Cache = {
  get: (key: string, hash: string) => number[] | null
  set: (key: string, hash: string, embedding: number[]) => void
  close: () => void
}

function createCache(path: string): Cache {
  const db = new Database(path)
  db.run(`
    CREATE TABLE IF NOT EXISTS embeddings (
      key TEXT PRIMARY KEY,
      hash TEXT NOT NULL,
      embedding TEXT NOT NULL,
      created INTEGER NOT NULL
    )
  `)

  return {
    get: (key, hash) => {
      const row = db
        .query<{ key: string; hash: string; embedding: string }, [string]>("SELECT * FROM embeddings WHERE key = ?")
        .get(key)
      if (!row || row.hash !== hash) return null
      try {
        return JSON.parse(row.embedding) as number[]
      } catch {
        return null
      }
    },
    set: (key, hash, embedding) => {
      db.run("INSERT OR REPLACE INTO embeddings (key, hash, embedding, created) VALUES (?, ?, ?, ?)", [
        key,
        hash,
        JSON.stringify(embedding),
        Date.now(),
      ])
    },
    close: () => db.close(),
  }
}

run().catch((err) => {
  throw err
})
