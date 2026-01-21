// Copies skills into an output directory and replaces frontmatter from updates.
// Usage: bun run eval/merge-frontmatter.ts <source> <updates> <output>
import { join } from "node:path"
import { mkdir, rm, readdir, readFile, writeFile, copyFile } from "node:fs/promises"

const [source, updates, output] = process.argv.slice(2)

if (!source || !updates || !output) {
  throw new Error("Usage: bun run eval/merge-frontmatter.ts <source> <updates> <output>")
}

await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })
await copyDir(source, output)
await applyFrontmatter(updates, output)

async function copyDir(src: string, dest: string): Promise<void> {
  const entries = await readdir(src, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const srcPath = join(src, entry.name)
    const destPath = join(dest, entry.name)
    if (entry.isDirectory()) {
      await mkdir(destPath, { recursive: true })
      await copyDir(srcPath, destPath)
      continue
    }
    if (entry.isFile()) {
      await copyFile(srcPath, destPath)
    }
  }
}

async function applyFrontmatter(updateDir: string, targetDir: string): Promise<void> {
  const entries = await readdir(updateDir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const updateSkill = join(updateDir, entry.name, "SKILL.md")
    const targetSkill = join(targetDir, entry.name, "SKILL.md")
    const updateContent = await readFile(updateSkill, "utf8").catch(() => "")
    const targetContent = await readFile(targetSkill, "utf8").catch(() => "")
    const updatedFrontmatter = extractFrontmatter(updateContent)
    if (!updatedFrontmatter) continue
    const merged = replaceFrontmatter(targetContent, updatedFrontmatter)
    await writeFile(targetSkill, merged)
  }
}

function extractFrontmatter(content: string): string {
  const match = content.match(/^---\n[\s\S]*?\n---\n/)
  return match ? match[0] : ""
}

function replaceFrontmatter(content: string, frontmatter: string): string {
  const match = content.match(/^---\n[\s\S]*?\n---\n/)
  if (!match) return frontmatter + content
  return content.replace(match[0], frontmatter)
}
