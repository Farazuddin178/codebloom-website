# CodeBloomAPP website

Landing page for CodeBloomAPP set inside a real-time 3D "knowledge network" built with Three.js. As you scroll, the camera flies through glowing nodes and links, past floating code symbols, with data pulses running between them. Bookings go straight into a Google Sheet.

There is no framework and no build step. Vercel (or GitHub Pages) serves the `public/` folder as-is.

## Edit the site

| What | Where |
| --- | --- |
| Text, links, course cards, reviews | `public/index.html` |
| Colours, fonts, layout | `public/assets/site.css` (theme colours are at the top) |
| Menu, videos, scroll reveal, booking form, loading the 3D scene | `public/assets/site.js` |
| Booking form fields | the `<dialog id="book">` block near the end of `public/index.html` |
| Google Sheet script | `google-apps-script/Code.gs` |
| Course images | `public/images/` (WebP) |
| Videos | `public/videos/` |
| SEO | `public/robots.txt`, `public/sitemap*.xml`, `public/video-sitemap.xml` |

### The 3D background (`public/assets/scene/network.js`)

One file builds the whole scene: the sky, the grid floor, the network of nodes and links, the travelling data pulses, the floating code symbols and the wireframe shapes. It also handles the scroll-driven camera. The colours are in `COLORS` and the code symbols in `GLYPHS`, both at the top of the file.

Three.js r170 is stored in `public/vendor/three/`, so the site doesn't depend on any outside CDN.

The scene adapts to the device. Phones and low-power machines get fewer nodes and a lower resolution. Visitors who have "reduce motion" turned on get a still scene. If WebGL isn't available, a gradient background is shown instead. A "Pause animation" button in the bottom-left corner stops the movement.

## Booking form → Google Sheet

Every "Book Now", "Enroll Now" and "Get Started" button opens the built-in booking form. "Enroll Now" on a course card fills in that course for you. Each booking becomes a new row in a Google Sheet. No email or SMTP is involved.

One-time setup (about 5 minutes):

1. Create a new Google Sheet, for example "CodeBloomAPP bookings", in the Google account that should own the data.
2. In the sheet, open **Extensions → Apps Script**. Delete the sample code, paste in everything from `google-apps-script/Code.gs`, and click **Save**.
3. Optional check: pick `testBooking` in the function list at the top and click **Run**. Approve the permissions it asks for (Google shows an "unverified app" warning because it's your own script: **Advanced → Go to … (unsafe)**). A "Demo bookings" tab appears with one test row, which you can delete.
4. Click **Deploy → New deployment**. Click the gear icon and choose **Web app**. Set **Execute as: Me** and **Who has access: Anyone**, then click **Deploy**.
5. Copy the **Web app URL** (it ends in `/exec`). Paste it into `BOOKING_ENDPOINT` at the top of `public/assets/site.js`:
   ```js
   const BOOKING_ENDPOINT = 'https://script.google.com/macros/s/XXXXXXXX/exec';
   ```
6. Commit and push. Bookings now show up in the sheet within a second or two.

If you change `Code.gs` later, use **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy**. That keeps the same URL. Using "New deployment" again would give you a new URL, which you would then have to paste into `site.js` again.

"Who has access: Anyone" only means the website can send bookings to the script. Nobody can read the sheet unless you share it.

Each successful booking also sends a `generate_lead` event to Google Analytics and a `Lead` event to the Meta Pixel.

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
