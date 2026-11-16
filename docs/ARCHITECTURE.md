# Exterior Studio — Technical architecture

## Current working prototype

- A procedural demonstration house in Three.js (**not reconstructed** from an uploaded photo)
- Semantic selectable mesh categories: siding, roof, trim, garage
- Material changes staged in the React sidebar and applied in one operation
- Four PNG captures from the same rendered demonstration model
- Real photo upload to `POST /api/analyze` using the **Gemini Developer API**, not OpenAI
- A JSON result pane showing architectural observations and missing elevation views
- A second Gemini endpoint (`POST /api/scene-plan`) that estimates normalized front-facade layout
- A procedural Three.js builder (`lib/build-house.ts`) that replaces the default house with editable schematic wall, roof, door, window, garage and porch-post meshes; depth and unseen elevations remain placeholders

## AI analysis contract

Frontend: `app/page.tsx` uploads multipart form data named `photo` to `/api/analyze`.
Backend: `app/api/analyze/route.ts` validates JPEG/PNG/WebP up to 8 MB, sends the image from the server to Google's `generateContent` REST API, requests JSON output, validates expected properties, and returns `{ analysis, model }`.

`analysis` fields:
- `building_summary`
- `photo_view`
- `visible_components[]` with `component, count, notes, confidence`
- `missing_views[]`
- `reconstruction_notes[]`

The analysis response is **not** a segmentation mask, polygon boundary, CAD drawing, or measured elevation. A separate schematic plan request creates rough 3D meshes from estimated normalized facade boxes, but those meshes are **not** a verified reconstruction or product-ready CAD model.

## Planned production pipeline

1. Accept consented front/back/left/right home photographs, detect which elevations are available.
2. Estimate visible features and camera viewpoints using an image-understanding model.
3. Run a dedicated segmentation model for per-surface masks; provide user correction tools.
4. Estimate camera poses and assemble a consistent semantic 3D mesh; mark unknown back/side geometry rather than inventing it.
5. Load the resulting GLB with per-object `componentId` and `semanticClass` in Three.js.
6. Allow hover/selection of individual surfaces and assignment of validated James Hardie product data.
7. Apply staged changes to the model; optional photorealistic rendering after confirmation.
8. Export front, rear, left, and right PNGs from one consistent 3D model.

## Operational and privacy guardrails

- Required server environment variables: `GEMINI_API_KEY`, optional `GEMINI_MODEL` (defaults to `gemini-2.5-flash-lite`).
- `.env.local` must be kept out of source control; never use `NEXT_PUBLIC_` for the API key.
- Free-tier Gemini image requests may be used to improve Google's products. Do not use confidential James Hardie or homeowner content on the free tier without approval.
- The API has provider quotas. Production needs authentication, quotas, rate limiting, and consent/privacy handling.
- No specific James Hardie material may be inferred as a fact from an arbitrary photograph.
- The demo has no actual branded product imagery, verified finishes, or measurement accuracy guarantees.
