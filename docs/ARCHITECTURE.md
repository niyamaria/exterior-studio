# Exterior Studio — Technical plan

## Prototype currently in repository
- Procedural **demo** house geometry in Three.js (NOT reconstructed from photos)
- Click/hover mesh detection; per-part semantic IDs
- Staged material/color selections and a single Apply Design action
- Client-side front/back/left/right PNG camera exports from the same scene
- Photo upload and server-side GPT architectural observations via /api/analyze (requires API key); no pixel masks or reconstruction yet

## Planned production pipeline
1. Upload authorized front/back/left/right house photos to private object storage.
2. OpenAI vision request produces a *structured architectural description* (not a 3D mesh).
3. Segmentation service creates individual exterior surface masks; humans can correct them.
4. Reconstruction worker estimates camera poses and creates/edits semantic mesh objects; record uncertainty for hidden faces.
5. Three.js loads one consistent GLB model, each mesh with a stable `componentId` and `semanticClass`.
6. Users stage changes locally; apply all material selections in one batch. Optional server image-edit pass improves photorealism but must not modify architecture.
7. Export four orthographic/elevation PNGs from the same rendered scene. If sides are unseen, mark geometry estimated rather than assert accuracy.

## Security
- Never put OPENAI_API_KEY into NEXT_PUBLIC_* or client bundles.
- The analysis endpoint makes a server-side OpenAI Responses API call using OPENAI_API_KEY from .env.local. Do not commit secrets. Add authentication, abuse protection, rate limits, privacy controls and persistence before public deployment.
- Do not commit customer photos, corporate assets, or proprietary materials.
- Product/color sample values in the demo are illustrative and not a verified catalog.
