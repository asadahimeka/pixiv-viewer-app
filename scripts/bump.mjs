import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = f => fs.readFileSync(path.join(root, f), 'utf8')
const write = (f, s) => fs.writeFileSync(path.join(root, f), s)

const pkg = JSON.parse(read('package.json'))
const cur = pkg.version

const arg = process.argv[2]
if (!arg || /^(patch|minor|major)$/.test(arg) === false && /^\d+\.\d+\.\d+$/.test(arg) === false) {
  console.error('Usage: node scripts/bump.mjs <newVersion | patch | minor | major>')
  process.exit(1)
}

let next = arg
if (/^(patch|minor|major)$/.test(arg)) {
  const [ma, mi, pa] = cur.split('.').map(Number)
  if (arg === 'patch') next = `${ma}.${mi}.${pa + 1}`
  else if (arg === 'minor') next = `${ma}.${mi + 1}.0`
  else next = `${ma + 1}.0.0`
}
if (next === cur) {
  console.error(`Version is already ${cur}`)
  process.exit(1)
}

const code = new Date().toISOString().slice(0, 10).replace(/-/g, '')
const changed = []

const sub = (f, re, rep) => {
  const s = read(f)
  const out = s.replace(re, rep)
  if (out === s) throw new Error(`no match in ${f}: ${re}`)
  write(f, out)
  changed.push(f)
}

sub('package.json', /^(\s*"version"\s*:\s*")[^"]*(")/m, `$1${next}$2`)
sub('src-tauri/tauri.conf.json', /^(\s*"version"\s*:\s*")[^"]*(")/m, `$1${next}$2`)
sub('src-tauri/Cargo.toml', /^version\s*=\s*"[^"]*"/m, `version = "${next}"`)
sub('src-tauri/Cargo.lock', /(name = "app"\r?\nversion = ")[^"]+(")/, `$1${next}$2`)
sub('android/app/build.gradle', /versionName\s+"[^"]*"/, `versionName "${next}"`)
sub('android/app/build.gradle', /versionCode\s+\d+/, `versionCode ${code}`)
sub('ios/App/App.xcodeproj/project.pbxproj', /(MARKETING_VERSION = )[^;]+;/g, `$1${next};`)
sub('ios/App/App.xcodeproj/project.pbxproj', /(CURRENT_PROJECT_VERSION = )[^;]+;/g, `$1${code};`)
sub('capacitor.config.json', /PixivViewer\/[\d.]+/g, `PixivViewer/${next}`)
sub('capacitor.config.json', /iPxve\/[\d.]+/g, `iPxve/${next}`)

console.log(`bumped ${cur} -> ${next} (versionCode ${code})`)
for (const f of changed) console.log(`  updated: ${f}`)
console.log('remember to run `node scripts/check-version.mjs` and commit.')
