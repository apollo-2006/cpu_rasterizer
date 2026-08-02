import React, { useEffect, useRef, useState } from 'react';

// ============================================================================
// 1. RAW 3D MATH ENGINE (No external libraries)
// ============================================================================

class Vec3 {
  constructor(x = 0, y = 0, z = 0, w = 1) {
    this.x = x; this.y = y; this.z = z; this.w = w;
  }
  // NOTE: add/sub/mul/div now carry `w` through instead of silently resetting
  // it to the constructor default. Losing w here is what killed the depth
  // buffer: after the perspective divide every vertex reported w = 1.
  static add(v1, v2) { return new Vec3(v1.x + v2.x, v1.y + v2.y, v1.z + v2.z, v1.w); }
  static sub(v1, v2) { return new Vec3(v1.x - v2.x, v1.y - v2.y, v1.z - v2.z, v1.w); }
  static mul(v, k) { return new Vec3(v.x * k, v.y * k, v.z * k, v.w); }
  static div(v, k) { return new Vec3(v.x / k, v.y / k, v.z / k, v.w); }
  static dotProduct(v1, v2) { return v1.x * v2.x + v1.y * v2.y + v1.z * v2.z; }
  static crossProduct(v1, v2) {
    return new Vec3(
        v1.y * v2.z - v1.z * v2.y,
        v1.z * v2.x - v1.x * v2.z,
        v1.x * v2.y - v1.y * v2.x
    );
  }
  static normalize(v) {
    const l = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    return l === 0 ? new Vec3() : new Vec3(v.x / l, v.y / l, v.z / l);
  }
}

class Mat4x4 {
  constructor() {
    this.m = [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ];
  }
  static multiplyVector(m, i) {
    const v = new Vec3();
    v.x = i.x * m.m[0][0] + i.y * m.m[1][0] + i.z * m.m[2][0] + i.w * m.m[3][0];
    v.y = i.x * m.m[0][1] + i.y * m.m[1][1] + i.z * m.m[2][1] + i.w * m.m[3][1];
    v.z = i.x * m.m[0][2] + i.y * m.m[1][2] + i.z * m.m[2][2] + i.w * m.m[3][2];
    v.w = i.x * m.m[0][3] + i.y * m.m[1][3] + i.z * m.m[2][3] + i.w * m.m[3][3];
    return v;
  }
  static multiplyMatrix(m1, m2) {
    const mat = new Mat4x4();
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        mat.m[r][c] = m1.m[r][0] * m2.m[0][c] + m1.m[r][1] * m2.m[1][c] + m1.m[r][2] * m2.m[2][c] + m1.m[r][3] * m2.m[3][c];
      }
    }
    return mat;
  }
  static makeIdentity() {
    const mat = new Mat4x4();
    mat.m[0][0] = 1; mat.m[1][1] = 1; mat.m[2][2] = 1; mat.m[3][3] = 1;
    return mat;
  }
  static makeRotationX(angleRad) {
    const mat = new Mat4x4();
    mat.m[0][0] = 1;
    mat.m[1][1] = Math.cos(angleRad);
    mat.m[1][2] = Math.sin(angleRad);
    mat.m[2][1] = -Math.sin(angleRad);
    mat.m[2][2] = Math.cos(angleRad);
    mat.m[3][3] = 1;
    return mat;
  }
  static makeRotationY(angleRad) {
    const mat = new Mat4x4();
    mat.m[0][0] = Math.cos(angleRad);
    mat.m[0][2] = -Math.sin(angleRad);
    mat.m[1][1] = 1;
    mat.m[2][0] = Math.sin(angleRad);
    mat.m[2][2] = Math.cos(angleRad);
    mat.m[3][3] = 1;
    return mat;
  }
  static makeRotationZ(angleRad) {
    const mat = new Mat4x4();
    mat.m[0][0] = Math.cos(angleRad);
    mat.m[0][1] = Math.sin(angleRad);
    mat.m[1][0] = -Math.sin(angleRad);
    mat.m[1][1] = Math.cos(angleRad);
    mat.m[2][2] = 1;
    mat.m[3][3] = 1;
    return mat;
  }
  static makeTranslation(x, y, z) {
    const mat = Mat4x4.makeIdentity();
    mat.m[3][0] = x; mat.m[3][1] = y; mat.m[3][2] = z;
    return mat;
  }
  static makeProjection(fovDegrees, aspectRatio, near, far) {
    const fovRad = 1.0 / Math.tan(fovDegrees * 0.5 / 180.0 * Math.PI);
    const mat = new Mat4x4();
    mat.m[0][0] = aspectRatio * fovRad;
    mat.m[1][1] = fovRad;
    mat.m[2][2] = far / (far - near);
    mat.m[3][2] = (-far * near) / (far - near);
    mat.m[2][3] = 1.0;
    mat.m[3][3] = 0.0;
    return mat;
  }
}

class Triangle {
  constructor(p1, p2, p3, color = [255, 255, 255]) {
    this.p = [p1, p2, p3];
    this.color = color;
    this.invW = [1, 1, 1];   // 1/w per vertex, captured before the divide
  }
}

// Procedural Geometry Generator: A Torus (Donut)
function generateTorus(segments, rings, outerRadius, innerRadius) {
  const tris = [];
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < rings; j++) {
      const nextI = (i + 1) % segments;
      const nextJ = (j + 1) % rings;

      const getPoint = (s, r) => {
        const theta = (s * 2.0 * Math.PI) / segments;
        const phi = (r * 2.0 * Math.PI) / rings;
        return new Vec3(
            (outerRadius + innerRadius * Math.cos(phi)) * Math.cos(theta),
            (outerRadius + innerRadius * Math.cos(phi)) * Math.sin(theta),
            innerRadius * Math.sin(phi)
        );
      };

      const p0 = getPoint(i, j);
      const p1 = getPoint(nextI, j);
      const p2 = getPoint(i, nextJ);
      const p3 = getPoint(nextI, nextJ);

      tris.push(new Triangle(p0, p2, p1));
      tris.push(new Triangle(p1, p2, p3));
    }
  }
  return tris;
}

// ============================================================================
// 2. THE RASTERIZER (Drawing directly to memory)
// ============================================================================
class SoftwareRasterizer {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.colorBuffer = new Uint8ClampedArray(width * height * 4);
    this.depthBuffer = new Float32Array(width * height);
  }

  clear() {
    this.colorBuffer.fill(15);
    for (let i = 3; i < this.colorBuffer.length; i += 4) {
      this.colorBuffer[i] = 255;
    }
    this.depthBuffer.fill(0.0); // 0 = infinitely far, we store 1/w
  }

  drawPixel(x, y, z, r, g, b) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    const index = y * this.width + x;

    // Depth test. z here is 1/w, so LARGER means CLOSER to the camera.
    if (z > this.depthBuffer[index]) {
      this.depthBuffer[index] = z;
      const pIndex = index * 4;
      this.colorBuffer[pIndex] = r;
      this.colorBuffer[pIndex + 1] = g;
      this.colorBuffer[pIndex + 2] = b;
    }
  }

  // Barycentric rasterization. Weights are divided by the signed area, which
  // makes the inside test (all weights >= 0) work for either winding order.
  drawTriangle(x0, y0, z0, x1, y1, z1, x2, y2, z2, r, g, b, wireframe) {
    const ix0 = x0 | 0, iy0 = y0 | 0;
    const ix1 = x1 | 0, iy1 = y1 | 0;
    const ix2 = x2 | 0, iy2 = y2 | 0;

    const minX = Math.max(0, Math.min(ix0, ix1, ix2));
    const maxX = Math.min(this.width - 1, Math.max(ix0, ix1, ix2));
    const minY = Math.max(0, Math.min(iy0, iy1, iy2));
    const maxY = Math.min(this.height - 1, Math.max(iy0, iy1, iy2));

    const area = (ix2 - ix0) * (iy1 - iy0) - (ix1 - ix0) * (iy2 - iy0);
    if (area === 0) return;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const w0 = ((ix1 - ix2) * (y - iy2) - (iy1 - iy2) * (x - ix2)) / area;
        const w1 = ((ix2 - ix0) * (y - iy0) - (iy2 - iy0) * (x - ix0)) / area;
        const w2 = 1.0 - w0 - w1;

        if (w0 >= 0 && w1 >= 0 && w2 >= 0) {
          // 1/w interpolates linearly in screen space. z (post-divide)
          // does not, which is why the depth value stored is 1/w.
          const z = w0 * z0 + w1 * z1 + w2 * z2;

          if (wireframe) {
            if (w0 < 0.05 || w1 < 0.05 || w2 < 0.05) {
              this.drawPixel(x, y, z, 0, 255, 128);
            }
          } else {
            this.drawPixel(x, y, z, r, g, b);
          }
        }
      }
    }
  }

  // Render the depth buffer itself as greyscale. Useful as a correctness
  // check: a working z-buffer shows a smooth gradient across the surface.
  blitDepth() {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < this.depthBuffer.length; i++) {
      const d = this.depthBuffer[i];
      if (d > 0) { if (d < lo) lo = d; if (d > hi) hi = d; }
    }
    const span = hi - lo || 1;
    for (let i = 0; i < this.depthBuffer.length; i++) {
      const d = this.depthBuffer[i];
      const v = d > 0 ? 30 + 225 * ((d - lo) / span) : 15;
      const p = i * 4;
      this.colorBuffer[p] = v;
      this.colorBuffer[p + 1] = v;
      this.colorBuffer[p + 2] = v;
    }
  }
}

// ============================================================================
// 3. REACT COMPONENT & RENDER LOOP
// ============================================================================
export default function HardwareRasterizer() {
  const canvasRef = useRef(null);
  const [stats, setStats] = useState({ fps: 0, ms: 0, tris: 0 });
  const [wireframe, setWireframe] = useState(false);
  const [culling, setCulling] = useState(true);
  const [showDepth, setShowDepth] = useState(false);

  const RENDER_WIDTH = 400;
  const RENDER_HEIGHT = 300;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const rasterizer = new SoftwareRasterizer(RENDER_WIDTH, RENDER_HEIGHT);
    const meshTorus = generateTorus(24, 12, 1.5, 0.5);

    let fTheta = 0;
    let frameCount = 0;          // was referenced but never declared
    let animationFrameId;
    let lastTime = performance.now();
    const matProj = Mat4x4.makeProjection(90.0, RENDER_HEIGHT / RENDER_WIDTH, 0.1, 1000.0);

    const renderLoop = (currentTime) => {
      const dt = Math.max(1, currentTime - lastTime);
      lastTime = currentTime;
      fTheta += 0.01;
      frameCount++;

      rasterizer.clear();

      const matRotZ = Mat4x4.makeRotationZ(fTheta * 0.5);
      const matRotX = Mat4x4.makeRotationX(fTheta);
      const matTrans = Mat4x4.makeTranslation(0.0, 0.0, 5.0);

      let matWorld = Mat4x4.multiplyMatrix(matRotZ, matRotX);
      matWorld = Mat4x4.multiplyMatrix(matWorld, matTrans);

      const trianglesToRasterize = [];

      for (const tri of meshTorus) {
        const triTransformed = new Triangle(
            Mat4x4.multiplyVector(matWorld, tri.p[0]),
            Mat4x4.multiplyVector(matWorld, tri.p[1]),
            Mat4x4.multiplyVector(matWorld, tri.p[2])
        );

        const line1 = Vec3.sub(triTransformed.p[1], triTransformed.p[0]);
        const line2 = Vec3.sub(triTransformed.p[2], triTransformed.p[0]);
        const normal = Vec3.normalize(Vec3.crossProduct(line1, line2));
        const cameraRay = Vec3.sub(triTransformed.p[0], new Vec3(0, 0, 0));

        if (!culling || Vec3.dotProduct(normal, cameraRay) < 0.0) {
          let lightDirection = new Vec3(0.0, 1.0, -1.0);
          lightDirection = Vec3.normalize(lightDirection);
          const dp = Math.max(0.1, Vec3.dotProduct(lightDirection, normal));

          const r = Math.floor(147 * dp);
          const g = Math.floor(51 * dp);
          const b = Math.floor(234 * dp);

          const projected = [
            Mat4x4.multiplyVector(matProj, triTransformed.p[0]),
            Mat4x4.multiplyVector(matProj, triTransformed.p[1]),
            Mat4x4.multiplyVector(matProj, triTransformed.p[2]),
          ];

          const triProjected = new Triangle(projected[0], projected[1], projected[2], [r, g, b]);

          // Capture 1/w BEFORE dividing. w is the view-space depth, and
          // it is the only depth information that survives projection.
          triProjected.invW = projected.map((v) => (v.w !== 0 ? 1.0 / v.w : 0));

          for (let i = 0; i < 3; i++) {
            const w = projected[i].w || 1;
            triProjected.p[i] = Vec3.div(triProjected.p[i], w);
          }

          const offsetView = new Vec3(1, 1, 0);
          for (let i = 0; i < 3; i++) {
            triProjected.p[i] = Vec3.add(triProjected.p[i], offsetView);
            triProjected.p[i].x *= 0.5 * RENDER_WIDTH;
            triProjected.p[i].y *= 0.5 * RENDER_HEIGHT;
          }

          trianglesToRasterize.push(triProjected);
        }
      }

      for (const t of trianglesToRasterize) {
        rasterizer.drawTriangle(
            t.p[0].x, t.p[0].y, t.invW[0],
            t.p[1].x, t.p[1].y, t.invW[1],
            t.p[2].x, t.p[2].y, t.invW[2],
            t.color[0], t.color[1], t.color[2],
            wireframe
        );
      }

      if (showDepth) rasterizer.blitDepth();

      const imgData = new ImageData(rasterizer.colorBuffer, RENDER_WIDTH, RENDER_HEIGHT);
      ctx.putImageData(imgData, 0, 0);

      if (frameCount % 10 === 0) {
        setStats({
          fps: Math.round(1000 / dt),
          ms: Math.round(dt),
          tris: trianglesToRasterize.length,
        });
      }

      animationFrameId = requestAnimationFrame(renderLoop);
    };

    animationFrameId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [wireframe, culling, showDepth]);

  const toggle = (label, value, setValue) => (
      <label className="flex items-center gap-3 cursor-pointer">
        <input
            type="checkbox"
            checked={value}
            onChange={(e) => setValue(e.target.checked)}
            className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-900"
        />
        <span className="text-sm text-zinc-300">{label}</span>
      </label>
  );

  return (
      <div className="min-h-screen bg-zinc-950 text-emerald-400 p-8 font-mono selection:bg-emerald-900 flex flex-col items-center justify-center">
        <div className="max-w-4xl w-full">
          <div className="flex flex-wrap gap-4 justify-between items-end border-b border-zinc-800 pb-4 mb-8">
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">CPU Software Rasterizer</h1>
              <p className="text-zinc-500 text-sm mt-1">Zero-dependency 3D rendering pipeline.</p>
            </div>

            <div className="flex gap-6 text-sm">
              <div className="flex flex-col items-end">
                <span className="text-zinc-500 text-xs uppercase tracking-widest">Framerate</span>
                <span className={`font-bold ${stats.fps < 30 ? 'text-red-400' : 'text-emerald-400'}`}>
                                {stats.fps} FPS
                            </span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-zinc-500 text-xs uppercase tracking-widest">Draw Time</span>
                <span className="font-bold text-yellow-400">{stats.ms} ms</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-zinc-500 text-xs uppercase tracking-widest">Triangles</span>
                <span className="font-bold text-blue-400">{stats.tris}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-8">
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500 to-purple-600 rounded-xl blur opacity-25 group-hover:opacity-40 transition duration-1000"></div>
              <canvas
                  ref={canvasRef}
                  width={400}
                  height={300}
                  className="relative bg-zinc-900 rounded-xl shadow-2xl w-[600px] max-w-full h-auto"
                  style={{ imageRendering: 'pixelated' }}
              />
              <div className="absolute bottom-4 left-4 flex gap-2">
                            <span className="px-2 py-1 bg-black/60 backdrop-blur border border-white/10 rounded text-[10px] text-zinc-300">
                                400x300 Internal Res
                            </span>
                <span className="px-2 py-1 bg-black/60 backdrop-blur border border-white/10 rounded text-[10px] text-zinc-300">
                                Uint8ClampedArray
                            </span>
              </div>
            </div>

            <div className="flex-1 min-w-[260px] space-y-6">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <h3 className="text-white font-bold mb-4 uppercase tracking-widest text-xs">Pipeline Controls</h3>
                <div className="space-y-4">
                  {toggle('Barycentric Wireframe Overlay', wireframe, setWireframe)}
                  {toggle('Backface Culling (Cross Product)', culling, setCulling)}
                  {toggle('Visualize Depth Buffer (1/w)', showDepth, setShowDepth)}
                </div>
              </div>

              <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-6">
                <h3 className="text-white font-bold mb-4 uppercase tracking-widest text-xs">Engine Architecture</h3>
                <ul className="text-xs text-zinc-400 space-y-2 leading-relaxed">
                  {[
                    'Calculates Model-View-Projection matrices purely in JavaScript.',
                    'Flat shading via surface normal dot products.',
                    'Z-buffer depth testing on interpolated 1/w, per pixel.',
                    'Barycentric coverage test, valid for either winding order.',
                    'Blits direct memory to HTML Canvas via putImageData().',
                  ].map((line) => (
                      <li key={line} className="flex items-start gap-2">
                        <span className="text-emerald-500">&#9657;</span>
                        <span>{line}</span>
                      </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
  );
}