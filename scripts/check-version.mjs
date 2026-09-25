import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = f => fs.readFileSync(path.join(root, f), 'utf8')

const v = JSON.parse(read('package.json')).version
const problems = []
const expect = (file, actual) => {
  if (actual !== v) problems.push(`${file}: expected ${v}, found ${actual}`)
}
const m1 = (s, re) => { const m = s.match(re); return m ? m[1] : null }

expect('src-tauri/tauri.conf.json', m1(read('src-tauri/tauri.conf.json'), /^\s*"version"\s*:\s*"([^"]+)"/m))
expect('src-tauri/Cargo.toml', m1(read('src-tauri/Cargo.toml'), /^version\s*=\s*"([^"]+)"/m))
expect('src-tauri/Cargo.lock', m1(read('src-tauri/Cargo.lock'), /name = "app"\r?\nversion = "([^"]+)"/))
expect('android/app/build.gradle', m1(read('android/app/build.gradle'), /versionName\s+"([^"]+)"/))

const gradleCode = m1(read('android/app/build.gradle'), /versionCode\s+(\d+)/)
if (!gradleCode) problems.push('android/app/build.gradle: versionCode missing')

const pbx = read('ios/App/App.xcodeproj/project.pbxproj')
for (const mm of pbx.matchAll(/MARKETING_VERSION = ([^;]+);/g)) {
  if (mm[1].trim() !== v) problems.push(`ios pbxproj MARKETING_VERSION: expected ${v}, found ${mm[1].trim()}`)
}
if (!/CURRENT_PROJECT_VERSION = \d+;/.test(pbx)) problems.push('ios pbxproj: CURRENT_PROJECT_VERSION missing')

const cap = read('capacitor.config.json')
for (const mm of cap.matchAll(/(?:PixivViewer|iPxve)\/(\d+\.\d+\.\d+)/g)) {
  if (mm[1] !== v) problems.push(`capacitor.config.json ${mm[0]}: expected ${v}`)
}

if (/CURRENT_APP_VERSION\s*=\s*['"`]v?\d/.test(read('src/consts/index.js'))) {
  problems.push('src/consts/index.js: CURRENT_APP_VERSION is hardcoded; import version from package.json instead')
}

if (problems.length) {
  console.error(`Version mismatch (source package.json = ${v}):`)
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}
console.log(`OK: all version fields consistent at ${v}`)
