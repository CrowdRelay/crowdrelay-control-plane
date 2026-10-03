import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve, relative, sep } from 'node:path'
import { promisify } from 'node:util'
import type { Plugin } from 'vite'

const run = promisify(execFile)

/**
 * Dev-only history for the style guide: `GET /__styleguide/history?files=a,b`
 * answers with the git commits that touched those files (paths relative to
 * `src/`), newest first, plus whether any of them has uncommitted edits.
 *
 * It gives every style-guide page a "last updated" date and a changelog that
 * can't go stale, because nobody writes them by hand. `apply: 'serve'` keeps
 * it out of production builds, and it only reads files inside `src/`.
 */
export function styleguideHistory(options: { root: string }): Plugin {
  const src = resolve(options.root, 'src')
  let remote: Promise<string | null> | null = null

  // https://github.com/owner/repo — for commit links. Null when there is no
  // GitHub remote; the page then shows hashes without links.
  const repoUrl = () => (remote ??= run('git', ['remote', 'get-url', 'origin'], { cwd: options.root })
    .then(({ stdout }) => {
      const m = stdout.trim().match(/github\.com[:/](.+?)(?:\.git)?$/)
      return m ? `https://github.com/${m[1]}` : null
    })
    .catch(() => null))

  return {
    name: 'styleguide-history',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__styleguide/history', async (req, res) => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(body))
        }
        try {
          const url = new URL(req.url ?? '', 'http://localhost')
          const files = (url.searchParams.get('files') ?? '').split(',').map(f => f.trim()).filter(Boolean)
          // Only plain paths inside src/ — this runs git with them.
          const paths = files
            .map(f => resolve(src, f))
            .filter(p => p.startsWith(src + sep) && /^[\w./@-]+$/.test(relative(src, p)) && existsSync(p))
          if (!paths.length) return send(200, { commits: [], dirty: [], repoUrl: null })

          const US = '\x1f', RS = '\x1e'
          const [log, status, repo] = await Promise.all([
            run('git', ['log', '--no-merges', '-n', '50', '--date=iso-strict', `--format=${RS}%H${US}%h${US}%ad${US}%an${US}%s`, '--name-only', '--', ...paths], { cwd: options.root, maxBuffer: 4 << 20 }),
            run('git', ['status', '--porcelain', '--', ...paths], { cwd: options.root }),
            repoUrl(),
          ])

          const top = (await run('git', ['rev-parse', '--show-toplevel'], { cwd: options.root })).stdout.trim()
          const toSrc = (repoPath: string) => relative(src, resolve(top, repoPath)).split(sep).join('/')
          const wanted = new Set(paths.map(p => relative(src, p).split(sep).join('/')))

          const commits = log.stdout.split(RS).filter(Boolean).map(block => {
            const [head = '', ...rest] = block.split('\n')
            const [hash, short, date, author, subject] = head.split(US)
            const touched = rest.map(l => l.trim()).filter(Boolean).map(toSrc).filter(f => wanted.has(f))
            return { hash, short, date, author, subject, files: touched }
          })
          const dirty = status.stdout.split('\n').filter(Boolean).map(l => toSrc(l.slice(3).trim().replace(/^.* -> /, '')))
          send(200, { commits, dirty, repoUrl: repo })
        } catch (error) {
          send(500, { error: error instanceof Error ? error.message : String(error) })
        }
      })
    },
  }
}
