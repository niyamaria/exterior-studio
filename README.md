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

## Correcting imperfect Gemini geometry

After **Generate schematic 3D**, use **Fine-tune the house layout**:

- **Flip facade left/right** if Gemini reverses garage and window placement. This mirrors the estimated opening and porch-post coordinates without an API call.
- **Roof shape → Front-facing gable ▲** if the reference photo has a triangular facade roofline but Gemini guessed a horizontal/side-facing ridge. The generator adds a smaller forward garage cross-gable in that configuration.
- Material previews and the four PNG exports use the corrected live Three.js scene.

This improves the *schematic interpretation* but does not guarantee an architectural match, reconstruct hidden sides, or implement pixel masks. For higher accuracy, the next milestone is image-aligned mask extraction plus manual editable control points (roof vertices and opening bounding boxes).


## Gemini → Blender → GLB (new)

Exterior Studio now has a local Blender generation path in addition to the quick Three.js schematic:

1. **Analyze house photo** → Gemini architectural observations.
2. **Generate schematic 3D** → Gemini returns a structured front-facade plan with opening coordinates, roof orientation, siding style and optional front gables.
3. **Fine-tune the house layout** → adjust orientation without more API calls.
4. **Build with Blender** → the local Next.js backend starts installed Blender in background and constructs real, named semantic meshes.
5. The site loads the resulting **GLB** into the existing Three.js viewer. Click to select elements, apply material changes and export PNG views; click **Download GLB** to keep the model.

**Blender installation:** Place Blender in `/Applications/Blender.app`, or set `BLENDER_EXECUTABLE` to its full executable path in your local `.env.local`. Restart `npm run dev` when changing configuration. This worker runs only in local development, **not** on Vercel.

**Test without using Gemini credits:**

```bash
mkdir -p output
/Applications/Blender.app/Contents/MacOS/Blender --background \
  --python scripts/blender/generate_house_from_plan.py -- \
  --plan examples/house-plan.example.json \
  --out output/sample-house.glb \
  --blend output/sample-house.blend
```

See [the complete implementation and JSON schema guide](docs/GEMINI_BLENDER_PIPELINE.md) for details.

**Fidelity limitation:** This uses procedural geometry from estimated layout, **not** an exact reconstruction of an uploaded house. The script creates semantic objects but does not produce image segmentation masks or fully recover hidden elevations. Use multiple real photos and manually review the detected positions.

## Visual refinement — soft shadows and two front gables

- Three.js now uses softer, higher studio lighting, stronger hemisphere fill, ACES tone mapping and softened shadow sampling.
- The imported Blender lawn/driveway no longer cast or receive enormous hard-edged shadows. The house still casts local architectural shadows.
- The Blender generator places the **largest detected gable farther back and taller**, and secondary gables farther forward and lower; the rear roof volume is less visually dominant.
- Upper-story/gable windows detected in the dominant gable can sit above the main ground-floor wall instead of being clamped below the eave.
- The porch header/soffit is thinner; driveway dimensions/colors are toned down.
- Gemini scene-planning instructions emphasize visible left-to-right orientation and separate gable peaks.

**Retest:** `git pull`, restart `npm run dev`, and run **Build with Blender** again after generating a house plan. Previously downloaded GLBs are static and won't automatically gain these changes. The geometry is still approximate; pixel-aligned facade masks and manual vertex corrections remain future work.



## Import the original detailed reference house (287 editable objects)

The earlier manually modeled Blender reference is **much more detailed** than the automated Gemini schematic. It includes an arched garage, windows, shutters, trim, gutters, driveway and landscaping. The website now accepts that GLB **directly** with the **Import detailed GLB** button located above the photo-analysis panel. No Gemini quota or Blender worker is required for direct import.

This model is available as the prior deliverable `real_reference_house_editable.glb`. Download it from the ChatGPT conversation, then import it from your Mac.

The GLB has 287 semantic mesh nodes named like `SHUTTER__...`, `GARAGE__...` and `TRIM__...`. The Three.js loader now interprets node-name prefixes as semantic classes when custom properties are unavailable, and the material studio includes **Shutters** and **Gutters** categories.

This is a **specific reference-based approximate reconstruction**, not an arbitrary photo-to-3D model. To generalize this fidelity, we need richer geometry extraction, per-photo semantic mask/landmark correction, and improvements to `scripts/blender/generate_house_from_plan.py`. Importing the previously built model is a controlled quality baseline, not automatic photo reconstruction.

## Imported GLB appears sideways or upside down

Some older procedural GLBs (including `real_reference_house_editable.glb`) encode **Z as the vertical axis**, while Three.js expects **Y-up**. Exterior Studio now detects a large XY-ground mesh in the imported GLB, rotates the asset into the web viewer's coordinate system, and automatically reframes the camera around the building rather than the oversized site plane. A front-facing three-quarter camera is chosen for this legacy house. Native Blender glTF files already exported Y-up should not be rotated.

If you imported before updating, run `git pull`, restart `npm run dev`, refresh and **Import detailed GLB** again. This corrects the presentation transform; it does not alter the original GLB file.


## 1–4 real-house photos: quick and multi-view workflows

**New:** Click **Add house photos (0/4)** and upload one to four authorized images of the **same house**. Each preview has an editable viewpoint label: **Front**, **Left side**, **Right side**, or **Rear**. Use only one photo for a quick facade-first estimate, or add more views for additional architectural evidence. There is one image per viewpoint; supported files are JPG/PNG/WebP, max 8 MB each and 24 MB total.

**One-click path:** Click **Build 3D from photos** to run the Gemini architectural plan and local Blender generator automatically. Or use the separate **Analyze house photo**, **Generate schematic 3D**, and **Build with Blender** buttons to inspect and correct intermediate results. Your existing material editing and GLB/PNG exports remain.

**Single photo:** Gemini is instructed to prioritize the photographed facade, keep its gable peaks separate, preserve visible window/garage placement, and distinguish arched versus rectangular openings plus shutters. Blender now generates basic arched trims and shutter mesh assemblies when the plan identifies them. Unseen elevations are provisional geometry, not verified.

**Multiple photos:** Gemini consumes all selected photos in one request with explicit viewpoint labels; the schema can return observed **side/rear openings**, which Blender places on the corresponding elevations. These observations may help consistency but are NOT photogrammetry, calibrated measurements, or proof of accuracy. Actual roof dimensions, depth and hidden surfaces are still inferred.

**Current limitations:** Adding more photographs can improve the result when they depict the same building from distinct clear angles, but it cannot guarantee architectural fidelity. The model still uses estimated front/side normalized boxes and a procedural component library. For a photo-exact match, we still need image masks, landmark calibration, explicit roof intersections, and an alignment/correction editor. The existing detailed imported GLB is a fidelity benchmark, not something the automated pipeline reproduces perfectly.

If Gemini is overloaded, retry later or import the detailed GLB directly. The local Blender step requires Blender installed on the machine running the Next.js dev server. No new API key is needed.

## Gemini request timeouts

If **Analyze house photo** or **Build 3D from photos** shows a timeout, the browser is working but Gemini did not respond before the request deadline. The app now uses separate per-attempt timeouts with at most two calls on connection errors and HTTP 5xx, instead of the previous shared 60-second timeout that made retries ineffective. Larger uploaded images are also resized to at most 1600 pixels on their long side for API analysis when this reduces their size; the original local photo preview remains unchanged. No change is needed to the API key or billing. Gemini can still be temporarily unavailable, and free-tier rate limits may still apply. Do not repeatedly hammer the API during outages.

For a quick smoke test, use **Build 3D from photos** (one Gemini planning call + local Blender), rather than running both the analysis and the builder unnecessarily.

## Photo-based color recognition

Gemini scene planning now requests distinct six-digit HEX estimates for siding, roof, trim, garage, front door, shutters, window frames and glazing. The Blender generator applies these colors to their corresponding semantic meshes; it no longer hardcodes beige trim/garage and brown doors. For `siding_style: "lap"`, it additionally builds subtle horizontal siding lines instead of leaving a featureless wall.

The Material Studio starts with the detected roof/siding/trim/garage/shutter colors and displays the exact current color plus an adjustable color picker in case lighting, shadows, or Gemini's visual estimate make it inaccurate. These values are visual estimates derived from the real photograph, not verified manufacturer paint names or color-calibrated readings.

Regenerate from the uploaded photo after pulling these changes; an existing static GLB will not update automatically.

## Facade geometry refinement: central dormer and porch

The planner now distinguishes a **central roof dormer** from a full-width front gable. A central dormer preserves the wide transverse main roof, constructs a separate raised dormer gable and pairs its windows above the main eave. Dormer windows are not duplicated on the ground-floor wall. The planner also returns normalized porch extent `{x,width,depth,railing}` so Blender can build columns, soffit, porch floor, and optional railing across the photographed span.

**Retest:** `git pull`, restart `npm run dev`, upload the reference again and click **Build 3D from photos**. The new Gemini plan and Blender export are required; a previously generated GLB remains unchanged. One photo cannot provide measured depths or hidden side/back details. These are structurally informed approximations, not photogrammetric reconstruction, and the new code still needs a first live validation in Blender.

## Facade alignment review before Blender generation (November 2026)

The single-photo and multi-photo pipeline now separates **photo interpretation** from **3D generation**. The primary action, **Detect facade for 3D**, uses Gemini to identify front-door bounds, front entrance steps (count, center and width), central dormer/window anchors, porch footprint, railing and support columns. The photo review panel then displays estimated colored overlays and editable numeric fields.

**Workflow:** upload 1–4 real house photos, label the front view, click **Detect facade for 3D**, inspect/correct the main entrance, steps, porch and dormer, then click **Build reviewed 3D**. Blender uses the corrected JSON; adjusting coordinates and rebuilding does **not** consume another Gemini analysis request.

The existing **Analyze house photo → Generate schematic 3D** route is still available, and the separate **Build with Blender** action can also build from the reviewed plan. The previous direct one-click Blender build was intentionally replaced with a review gate to avoid repeatedly generating visibly incorrect geometry.

The overlay positions are *approximate*: normalized facade coordinates are overlaid on the full source image, which may include sky, trees or perspective. This is a review aid, not calibrated image segmentation or a drag-to-mask tool. Side/rear geometry and depth remain estimates in one-photo mode, and additional photos do not guarantee exact reconstruction.

## Cottage shape fidelity correction (November 18)

Recent reference-photo testing showed the planning/review pipeline could label a door, staircase and dormer yet still build the wrong *house massing*. The Blender generator now treats the `central_dormer` archetype as a **single-height cottage under a broad transverse roof**, rather than a tall second-story rectangular facade. It also:
- ensures the exposed dormer is wide enough for paired windows; preserves two visible dormer windows even if Gemini groups them as a single opening;
- places the real front door on the ground-floor porch plane rather than treating photo-relative y as an elevated wall position;
- distinguishes roofed front porch width from the smaller railed sitting area;
- keeps separately selectable stair treads and corrects review overlay scaling to the visible image width.

A deliberately manually estimated **test fixture** (`examples/cottage-facade-test.json`) can reproduce this house type without Gemini. For testing on a Mac with Blender installed:
```bash
mkdir -p output
/Applications/Blender.app/Contents/MacOS/Blender --background \
 --python scripts/blender/generate_house_from_plan.py -- \
 --plan examples/cottage-facade-test.json --out output/cottage-test.glb
```
Import the resulting GLB in Exterior Studio to compare it with a Gemini-produced plan. The fixture is a visual approximation, not measured 3D reconstruction. The pipeline still lacks reliable true 2D image segmentation and calibrated projection, so manual numeric review and some visual deviation remain necessary.

## Raised front entrance

Gemini now provides foundation.raised and foundation.height (meters) for an entrance above surrounding ground. The review UI lets you correct that estimated elevation before building. Blender creates separate foundation walls and connects the exterior steps between yard grade and the raised porch. The GLB viewer also aligns the imported lawn with the display ground. This feature models a raised porch/foundation, not a hillside or a full second story. The cottage fixture uses an illustrative 0.68 m rise. Regenerate after pulling updates.
