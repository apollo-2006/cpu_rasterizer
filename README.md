# cpu_rasterizer

A complete 3D graphics pipeline written in plain JavaScript, running on the CPU. No
WebGL, no Three.js, no graphics API of any kind — the canvas is only somewhere to blit a
finished framebuffer.

**[Runs in your browser →](https://apollo-2006.github.io/cpu_rasterizer/)**

Toggle backface culling, the barycentric wireframe overlay, and a live depth-buffer
visualization while a torus rotates, with framerate and triangle count on screen.

## The pipeline

Every stage a GPU would do in hardware, done here in a loop:

1. **Model transform.** Rotation about Z and X composed with a translation into a single
   world matrix, so each vertex is transformed once rather than three times.
2. **Backface culling.** The surface normal comes from the cross product of two triangle
   edges; if it points away from the camera ray, the triangle is dropped before it costs
   anything. Toggle it off to watch the triangle count roughly double.
3. **Flat shading.** The dot product of the surface normal with the light direction gives
   one intensity per triangle, clamped so nothing goes fully black.
4. **Projection.** A 4x4 perspective matrix built from FOV, aspect ratio and the
   near/far planes. Vertices are carried as `(x, y, z, w)` throughout.
5. **Perspective divide.** Dividing by `w` is the step that makes distance shrink things.
6. **Viewport transform.** NDC in `[-1, 1]` scaled into the 400x300 framebuffer.
7. **Rasterization.** For each triangle, a screen-space bounding box, then three
   barycentric weights per pixel. Dividing the weights by the signed area makes the
   coverage test (`all weights >= 0`) correct for either winding order, so no separate
   clockwise/counter-clockwise case is needed.
8. **Depth test.** Per pixel, against a `Float32Array` z-buffer.
9. **Blit.** The `Uint8ClampedArray` colour buffer goes to the canvas in one
   `putImageData` call.

## The 1/w depth buffer

The depth value stored per pixel is `1/w`, not `z`.

Post-divide `z` does not interpolate linearly in screen space — halfway across a
triangle on screen is not halfway along it in the world — so interpolating `z` across a
face produces a depth that is subtly wrong everywhere except the vertices. `1/w` *does*
interpolate linearly in screen space, which is why it is captured before the perspective
divide and interpolated instead. Larger means closer, so the buffer clears to `0` for
infinitely far.

Getting this wrong is what the [write-up on this
project](https://abirdeol.tech/research) is about: `Vec3.add`/`sub`/`mul`/`div` were
resetting `w` to the constructor default, so every vertex reported `w = 1` after
projection and the depth buffer silently degenerated into no depth test at all. Turn on
**Visualize Depth Buffer** to check it: a working z-buffer shows a smooth gradient
across the surface, not a flat plate.

## Run locally

```bash
git clone https://github.com/apollo-2006/cpu_rasterizer.git
cd cpu_rasterizer

npm install
npm run dev
```

Other scripts: `npm run build`, `npm run preview`, `npm run lint`, and `npm run deploy`
to publish `dist/` to GitHub Pages.

## Layout

```
src/App.jsx     everything: Vec3, Mat4x4, torus generation, rasterizer, React shell
src/main.jsx    React entry point
src/index.css   Tailwind import
```

`App.jsx` is deliberately one file, in pipeline order: math, then rasterizer, then the
render loop.

## Known limits

* **400x300 internal resolution**, upscaled with `image-rendering: pixelated`. Per-pixel
  work in JavaScript does not go much higher at 60 FPS.
* **Flat shading only.** One colour per triangle; no Gouraud or Phong interpolation, no
  textures, no UVs.
* **No near-plane clipping.** Geometry crossing the camera plane is not clipped, so it
  will smear rather than being cut.
* **One hardcoded light and a fixed camera.** Neither is movable.
* **One procedural mesh.** A torus generated at startup; no model loading.

## Author

**Abir Deol**
