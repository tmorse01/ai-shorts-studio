import { CANVAS_HEIGHT, CANVAS_WIDTH, type Placement } from '@shared/compositor/frame'
import type { BitmapSource, FrameBackend, FrameBackground, VideoEffect } from './frameBackend'

// Each video layer is a textured quad. The vertex shader places the unit quad at the layer's
// placement (in canvas pixels), so the transform is applied on the GPU.
// The most textures kept at once: the video pool plus recent text bitmaps.
const TEXTURE_LIMIT = 64

const VERTEX_SHADER = `
attribute vec2 aCorner;
uniform vec2 uCanvas;
uniform vec2 uCenter;
uniform vec2 uSize;
uniform vec2 uRotation;
varying vec2 vUv;
void main() {
  vec2 offset = (aCorner - 0.5) * uSize;
  vec2 rotated = vec2(
    offset.x * uRotation.x - offset.y * uRotation.y,
    offset.x * uRotation.y + offset.y * uRotation.x
  );
  vec2 pixel = uCenter + rotated;
  gl_Position = vec4(pixel.x / uCanvas.x * 2.0 - 1.0, 1.0 - pixel.y / uCanvas.y * 2.0, 0.0, 1.0);
  vUv = aCorner;
}
`

// With uBlur set, the frame is averaged over a 9x9 grid of taps spread across uBlur (in UV units).
// uDim darkens the result. Both are zero for a direct draw, which then reads one texel.
const FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D uFrame;
uniform vec2 uBlur;
uniform float uDim;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  vec4 color;
  if (uBlur.x > 0.0 || uBlur.y > 0.0) {
    color = vec4(0.0);
    for (int i = -4; i <= 4; i++) {
      for (int j = -4; j <= 4; j++) {
        vec2 step = vec2(float(i), float(j)) / 4.0;
        color += texture2D(uFrame, vUv + step * uBlur);
      }
    }
    color /= 81.0;
  } else {
    color = texture2D(uFrame, vUv);
  }
  gl_FragColor = vec4(color.rgb * (1.0 - uDim), color.a) * uOpacity;
}
`

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Could not create a shader.')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`Shader failed to compile: ${log ?? 'no log'}`)
  }
  return shader
}

function linkProgram(gl: WebGLRenderingContext): WebGLProgram {
  const program = gl.createProgram()
  if (!program) throw new Error('Could not create a WebGL program.')
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER))
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER))
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`WebGL program failed to link: ${gl.getProgramInfoLog(program) ?? 'no log'}`)
  }
  return program
}

// Returns null when the canvas has no WebGL context, so the caller can fall back to 2D.
export function createWebGLBackend(canvas: HTMLCanvasElement): FrameBackend | null {
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true })
  if (!gl) return null

  const program = linkProgram(gl)
  gl.useProgram(program)
  gl.viewport(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  const corners = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, corners)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW)
  const cornerLocation = gl.getAttribLocation(program, 'aCorner')
  gl.enableVertexAttribArray(cornerLocation)
  gl.vertexAttribPointer(cornerLocation, 2, gl.FLOAT, false, 0, 0)

  const canvasSize = gl.getUniformLocation(program, 'uCanvas')
  const center = gl.getUniformLocation(program, 'uCenter')
  const size = gl.getUniformLocation(program, 'uSize')
  const rotation = gl.getUniformLocation(program, 'uRotation')
  const blur = gl.getUniformLocation(program, 'uBlur')
  const dim = gl.getUniformLocation(program, 'uDim')
  const opacityLocation = gl.getUniformLocation(program, 'uOpacity')
  // Layers blend over each other with premultiplied alpha, so a faded layer shows what is under it.
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
  gl.uniform2f(canvasSize, CANVAS_WIDTH, CANVAS_HEIGHT)
  gl.uniform1i(gl.getUniformLocation(program, 'uFrame'), 0)

  // One texture per source (a video element or a text bitmap). The count is capped, so the oldest is
  // freed when the cap is reached.
  const textures = new Map<object, WebGLTexture>()
  const textureFor = (source: object): WebGLTexture => {
    const existing = textures.get(source)
    if (existing) return existing
    const texture = gl.createTexture()
    if (!texture) throw new Error('Could not create a texture.')
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    if (textures.size >= TEXTURE_LIMIT) {
      const oldest = textures.entries().next()
      if (!oldest.done) {
        gl.deleteTexture(oldest.value[1])
        textures.delete(oldest.value[0])
      }
    }
    textures.set(source, texture)
    return texture
  }
  // Uploads the source and draws it as a quad. Bitmaps carry premultiplied alpha, like the shader output.
  const drawSource = (
    source: TexImageSource & object,
    placement: Placement,
    effect: VideoEffect | undefined,
    opacity: number,
    premultiplied: boolean
  ): void => {
    gl.bindTexture(gl.TEXTURE_2D, textureFor(source))
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiplied)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    const radians = (placement.rotationDeg * Math.PI) / 180
    gl.uniform2f(center, placement.centerX, placement.centerY)
    gl.uniform2f(size, placement.width, placement.height)
    gl.uniform2f(rotation, Math.cos(radians), Math.sin(radians))
    // The blur radius is in canvas pixels, so convert it to UV units across the quad.
    const blurPx = effect?.blurPx ?? 0
    gl.uniform2f(blur, blurPx / placement.width, blurPx / placement.height)
    gl.uniform1f(dim, effect?.dim ?? 0)
    gl.uniform1f(opacityLocation, opacity)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  return {
    kind: 'webgl',
    clear(background: FrameBackground = 'transparent') {
      gl.clearColor(0, 0, 0, background === 'black' ? 1 : 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
    },
    drawVideo(video: HTMLVideoElement, placement: Placement, effect?: VideoEffect, opacity = 1) {
      drawSource(video, placement, effect, opacity, false)
    },
    drawBitmap(bitmap: BitmapSource, placement: Placement, opacity = 1) {
      // Canvases carry premultiplied alpha. Images do not, so they are uploaded as they are.
      drawSource(bitmap, placement, undefined, opacity, !(bitmap instanceof HTMLImageElement))
    },
    dispose() {
      textures.forEach((texture) => gl.deleteTexture(texture))
      textures.clear()
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }
}
