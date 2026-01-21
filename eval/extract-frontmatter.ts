// Extracts frontmatter-only skill files into a target directory.
// Keeps only the YAML frontmatter and strips the body content.
// Usage: bun run eval/extract-frontmatter.ts <src> <dest>
import { join } from "node:path"
import { mkdir, rm, readdir, readFile, writeFile } from "node:fs/promises"

const [src, dest] = process.argv.slice(2)

if (!src || !dest) {
  throw new Error("Usage: bun run eval/extract-frontmatter.ts <src> <dest>")
}

await rm(dest, { recursive: true, force: true })
await mkdir(dest, { recursive: true })
await copyFrontmatter(src, dest)

async function copyFrontmatter(source: string, target: string): Promise<void> {
  const entries = await readdir(source, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const skillDir = join(source, entry.name)
    const outDir = join(target, entry.name)
    await mkdir(outDir, { recursive: true })
    const skillPath = join(skillDir, "SKILL.md")
    const content = await readFile(skillPath, "utf8").catch(() => "")
    const frontmatter = extractFrontmatter(content)
    await writeFile(join(outDir, "SKILL.md"), frontmatter)
  }
}

function extractFrontmatter(content: string): string {
  const match = content.match(/^---\n[\s\S]*?\n---\n/)
  return match ? match[0].trimEnd() + "\n" : ""
}
