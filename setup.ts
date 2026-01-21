// Copies a skill library into the local skill-eval workspace.
// Requires SKILL_SRC to avoid hardcoded global paths.
// Usage: SKILL_SRC=/path/to/skills bun run setup.ts
import { join } from "node:path"
import { rm, mkdir, readdir, copyFile } from "node:fs/promises"

const ROOT_DIR = import.meta.dir
const SKILL_DIR = join(ROOT_DIR, "skill")
const source = process.env.SKILL_SRC

if (!source) {
  throw new Error("Set SKILL_SRC to the skills directory to copy")
}

await rm(SKILL_DIR, { recursive: true, force: true })
await mkdir(SKILL_DIR, { recursive: true })
await copyDir(source, SKILL_DIR)

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
