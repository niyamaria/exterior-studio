# Gemini → Blender → Exterior Studio

This is the **first working vertical slice** of a procedural Blender modeling pipeline connected to Gemini architectural analysis. It produces *editable semantic meshes*, **not** a photogrammetric reconstruction.

## Pipeline

1. **Upload photo** on the Exterior Studio homepage. Real house photos only, with permission.
2. **Analyze house photo**: server-side Gemini provides architectural observations and uncertainties.
3. **Generate schematic 3D**: a second Gemini call (`POST /api/scene-plan`) returns the normalized JSON architectural plan.
4. **Fine-tune orientation**: flip front facade and choose main roof ridge direction. These edits cost no Gemini calls.
5. **Build with Blender**: browser submits the corrected plan to `POST /api/build-blender`. The local Next.js server runs installed Blender in background, passing a JSON plan file to `scripts/blender/generate_house_from_plan.py`.
6. Blender constructs actual separate objects, groups them into semantic collections, and exports **GLB**. GLB node metadata preserves `semantic_class`, `component_id`, `estimated_geometry`, and `locked_material`.
7. Browser loads GLB using Three.js `GLTFLoader` and replaces the quick procedural model. Existing orbit/click tools, batch color changes and PNG captures operate on the same scene. Download the GLB for direct Blender inspection.

## Mac prerequisites

- Install Blender 4.x or 5.x, preferably in `/Applications/Blender.app`. Your screenshot showed Blender 5.2.3.
- Node.js LTS and VS Code as before.
- `GEMINI_API_KEY` and `GEMINI_MODEL` in **local** `.env.local`.
- If Blender is elsewhere, set `BLENDER_EXECUTABLE=/full/path/to/Blender.app/Contents/MacOS/Blender` in `.env.local`, then restart `npm run dev`.

**Do not commit or paste your API key.** Blender is run **locally**, not in Vercel/Edge; hosted deployment needs a separate authenticated rendering worker and job queue. Local generation can be slower than the Three.js schematic. The code limits output file size and execution time.

## JSON schema contract

Source of truth: `lib/house-plan.ts` (TypeScript type and validation) and `app/api/scene-plan/route.ts` (Gemini structured-output schema).

```ts
type HousePlan = {
  stories: number; // 1–2 used by generator
  roof_type: "gable" | "hip" | "shed" | "flat";
  roof_color: string; // six-digit HEX
  siding_color: string; // six-digit HEX
  roof_ridge_direction: "front_to_back" | "left_to_right";
  roof_pitch: "low" | "medium" | "steep";
  garage_side?: "left" | "right" | "none";
  siding_style?: "board_and_batten" | "lap" | "stucco" | "other";
  front_gables?: Array<{
    center_x: number; // normalized facade left-to-right
    width: number; // normalized facade width
    height_ratio: number; // estimated roof rise relative to wall height
  }>;
  openings: Array<{
    kind: "window" | "entry_door" | "garage_door";
    x: number; // normalized left edge (0 = left)
    y: number; // normalized bottom edge (0 = ground)
    width: number;
    height: number;
  }>;
  porch_posts: number[]; // x positions, 0..1
  architectural_notes: string;
};
```

Gemini's geometric values are **estimates**; when data are insufficient, the model may generate incomplete or inaccurate plans. An example fixture is available at `examples/house-plan.example.json`. It is deliberately illustrative; it is not a verified reconstruction of a specific property.

## Standalone Blender test — no Gemini call needed

From the repository root on macOS:

```bash
mkdir -p output
/Applications/Blender.app/Contents/MacOS/Blender --background \
  --python scripts/blender/generate_house_from_plan.py -- \
  --plan examples/house-plan.example.json \
  --out output/sample-house.glb \
  --blend output/sample-house.blend
```

Import `output/sample-house.glb` via Blender → File → Import → glTF 2.0 or open the resulting `.blend` file. In the Outliner, inspect collections such as `CLASS - SIDING`, `CLASS - ROOF`, `CLASS - WINDOW`, `CLASS - TRIM`, `CLASS - GARAGE`, `CLASS - DOOR`, `CLASS - LANDSCAPE`.

For the web workflow, open `http://localhost:3000`, generate a Gemini plan, then click **Build with Blender**. This calls your locally installed Blender from the Next.js server. The generated GLB is returned to the browser; it is not automatically committed to GitHub or saved in a persistent backend.

## Known limitations

- One front photograph **cannot determine** accurate side/rear elevations, floor plan, roof intersections or dimensions.
- Blender currently creates roofs, siding battens, porch posts, decorative window/garage meshes, but **does not perform Boolean wall cutouts**, photogrammetry, depth estimation or multi-camera registration.
- Gable centers and opening positions are estimates; you must review them against the uploaded photo.
- Color selection uses illustrative swatches, not an approved or licensed James Hardie product database.
- The generated GLB has individually selectable objects and semantic metadata, but no automatic pixel-accurate segmentation masks yet. That should be a separate dedicated model and correction UI.
- Four PNG views originate from the same estimated 3D model; **unseen elevations are speculative**, not evidence of the actual house.

## Next technical goals

1. Multi-photo upload with front/side/rear grouping.
2. Dedicated image segmentation to obtain exact component masks, bounding boxes and key points.
3. Editable roof vertices and window boxes overlayed on the real photo, feeding corrected coordinates to Blender.
4. Proper architectural openings, separate roof masses, measured proportions, trim profiles and verified product materials.
5. Optional Blender-produced class/instance segmentation PNGs and native `.blend` download from a secured job service.
6. Reliable rendering worker + persistent storage when ready for deployment.
