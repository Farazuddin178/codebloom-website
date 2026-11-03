# CodeBloomAPP website

Landing page for CodeBloomAPP set inside a real-time 3D sakura river valley built with Three.js. As you scroll, the camera drifts down the river behind a small boat, and the sky turns from golden hour to night.

There is no framework and no build step. Vercel serves the `public/` folder as-is from its CDN.

## Edit the site

| What | Where |
| --- | --- |
| Text, links, course cards, reviews | `public/index.html` |
| Colours, fonts, layout | `public/assets/site.css` (theme colours are at the top) |
| Menu, videos, scroll reveal, loading the 3D scene | `public/assets/site.js` |
| Course images | `public/images/` (WebP) |
| Videos | `public/videos/` |
| SEO | `public/robots.txt`, `public/sitemap*.xml`, `public/video-sitemap.xml` |

### The 3D valley (`public/assets/scene/`)

| File | Contents |
| --- | --- |
| `main.js` | Renderer, the camera's path along the river, boat, render loop, quality settings |
| `palette.js` | Time-of-day colours (golden hour, sunset, blue hour, night) |
| `world.js` | River course and terrain height function |
| `terrain.js`, `water.js`, `sky.js` | Ground, river surface (reflections, wake, foam), sky and far mountains |
| `flora.js` | Sakura, broadleaf and pine trees, grass, rocks |
| `structures.js` | Red bridge, pagoda, torii gate, temple hall, stone lanterns, boat |
| `effects.js` | Falling petals, lantern glow and fireflies, river mist |

Three.js r170 is stored in `public/vendor/three/`, so the site doesn't depend on any outside CDN.

The scene adapts to the device. Phones and low-power machines get fewer trees, no live water reflections and a lower resolution. Visitors who have "reduce motion" turned on get a still scene. If WebGL isn't available, a gradient background is shown instead. A Pause button in the bottom-left corner stops the animation.

Commit and push to GitHub, and Vercel redeploys automatically.

## Preview locally

```bash
npm run dev
```

Then open http://localhost:3000. (The page uses JavaScript modules, so it must be served over HTTP. Opening `index.html` straight from disk won't work.)

## Deploy on Vercel (one time)

1. Push this folder to a GitHub repository.
2. On vercel.com: **Add New → Project → Import** the repository and click **Deploy**. Leave every setting at its default; `vercel.json` already tells Vercel to serve `public/`.

Every later push to the main branch goes live by itself.

## Adding images or videos

- Images: export them as `.webp` around 800px wide. Use [squoosh.app](https://squoosh.app) if you need a converter.
- Videos: keep them at 720p H.264 MP4, and try to stay under 3 MB each.
