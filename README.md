# Exterior Studio

Independent student research prototype for a James Hardie-inspired homeowner design experience. **Not** an official James Hardie website or product catalog.

## Quick start (Mac / VS Code)

1. Install Node.js LTS and open this repository in VS Code.
2. In the VS Code terminal, run `npm install`.
3. Copy `.env.example` into a new file named `.env.local` in the repository root.
4. Sign in to [Google AI Studio](https://aistudio.google.com/api-keys), create a Gemini Developer API key in an eligible free-tier project, and paste it into `.env.local`:
   ```env
   GEMINI_API_KEY=your_actual_key_here
   GEMINI_MODEL=gemini-3.5-flash-lite
   ```
5. Run `npm run dev` (restart if you changed `.env.local` while the server was open).
6. Go to <http://localhost:3000>.

**Updating an existing clone:** run `git pull`, update your local `.env.local` with the Gemini values above, remove any old `OPENAI_*` variables, then restart `npm run dev`.

## Test the photo-analysis workflow

1. Click **Add reference photo** and select a real house photo (JPEG, PNG or WebP, maximum 8 MB).
2. Click **Analyze house photo**.
3. Review the Gemini-generated component summary, estimated counts, confidence levels, and recommended additional angles.
4. Click **Generate schematic 3D** to produce normalized opening positions, a basic roof, estimated side/rear walls, and separately editable Three.js meshes. This makes a second Gemini call.
5. Hover/select surfaces, stage colors and click **Apply My Design**. PNG exports then use the new schematic scene.

**Current limitation:** the analysis is textual/structured; it does **not** generate segmented pixel masks or reconstruct the uploaded house in 3D. The interactive viewer remains a procedural demonstration house.

## Prototype features

- Browser-based Three.js 3D demo house with selectable semantic classes
- Orbit and zoom the model, hover parts and select them
- Stage siding, roof, trim and garage colors, then apply all changes together
- Export four PNG images (front/back/left/right) from the same **demo** scene
- Gemini photo analysis via server-only `app/api/analyze/route.ts`, returning the same JSON format expected by the existing UI

## Free tier, security, and privacy

- The default `gemini-3.5-flash-lite` has free-tier image/text requests according to Google's pricing, **subject to account eligibility, model availability, quotas, and rate limits**. Check [current pricing](https://ai.google.dev/gemini-api/docs/pricing) and your Google AI Studio project before using it.
- **Google can use content submitted through its free tier to improve its products.** Do not submit private homeowner photos, confidential partner materials, or other sensitive/corporate content without permission.
- Store `GEMINI_API_KEY` **only** in local `.env.local` or server-side deployment secrets. Never put it in `NEXT_PUBLIC_*`, frontend JavaScript, screenshots, or GitHub. `.env.local` is gitignored.
- The demo endpoint is for local development. Add authentication, rate limiting, and usage controls before public deployment.
- The endpoint forwards the photo bytes to Google for analysis; this prototype does not independently store uploaded images.
- No extra Gemini SDK dependency is needed: the existing Next.js backend makes a secure REST call.

## Not yet implemented

Automatic pixel-level segmentation masks, accurate multi-view photo-to-3D reconstruction, real James Hardie product textures or licensing, photorealistic AI re-rendering, persistent projects, or ZIP exports. Side and rear elevations in a front-only upload are always unverified placeholders.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the development roadmap.

## Visual quality improvements

The schematic 3D generator now produces attached sloped roof planes and gable walls, board-and-batten-style siding relief, window frames and mullions, segmented garage door panels, and a porch beam/canopy where posts are detected. We adjusted the camera and lighting for a more useful facade view. These are still **procedural estimates**, not photo-exact reconstructed surfaces. The model layout depends on how accurately Gemini estimates front-facade normalized boxes. Unseen sides/rear remain hypothetical; a production-grade visualizer needs explicit photo segmentation, camera pose estimation, multiple views, and local editing controls.

## Temporary Gemini 503 errors

Google sometimes returns `503 UNAVAILABLE` when its model is overloaded. Both photo analysis and scene planning now automatically retry up to **3 total attempts** with short exponential backoff for transient 5xx errors. The backend does not change the configured model or enable billing. If all attempts fail, the interface shows a clear temporary-overload message. These are provider-side errors, **not** invalid API keys. A `429` response means a separate quota or rate-limit issue and is not retried by this helper.
