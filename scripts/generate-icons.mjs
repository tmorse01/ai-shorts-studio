// Renders build/icon.ico and build/icon.png from resources/icon.svg. Run with `pnpm icons` and
// commit the output. The ICO holds PNG-encoded frames, which Windows reads at every size.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const svg = await readFile(resolve(root, 'resources/icon.svg'))
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
const PNG_SIZE = 512

function renderPng(size) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng()
}

// ICONDIR header, one ICONDIRENTRY per frame, then the frame data.
function buildIco(frames) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(frames.length, 4)

  const directory = Buffer.alloc(16 * frames.length)
  let offset = header.length + directory.length
  frames.forEach(({ size, png }, i) => {
    const at = i * 16
    // A width or height of 0 means 256.
    directory.writeUInt8(size === 256 ? 0 : size, at)
    directory.writeUInt8(size === 256 ? 0 : size, at + 1)
    directory.writeUInt8(0, at + 2)
    directory.writeUInt8(0, at + 3)
    directory.writeUInt16LE(1, at + 4)
    directory.writeUInt16LE(32, at + 6)
    directory.writeUInt32LE(png.length, at + 8)
    directory.writeUInt32LE(offset, at + 12)
    offset += png.length
  })
  return Buffer.concat([header, directory, ...frames.map((frame) => frame.png)])
}

const buildDir = resolve(root, 'build')
await mkdir(buildDir, { recursive: true })

const frames = ICO_SIZES.map((size) => ({ size, png: renderPng(size) }))
await writeFile(resolve(buildDir, 'icon.ico'), buildIco(frames))
await writeFile(resolve(buildDir, 'icon.png'), renderPng(PNG_SIZE))
console.log(`Wrote build/icon.ico (${ICO_SIZES.join(', ')} px) and build/icon.png (${PNG_SIZE} px)`)
