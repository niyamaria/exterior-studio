# Exterior Studio

Interactive James Hardie-inspired home exterior visualization research prototype. Independent student project; not an official James Hardie app.

## Start locally

1. Install Node.js LTS
2. Clone this repository into VS Code
3. Open terminal and run `npm install`
4. Run `npm run dev`
5. Visit http://localhost:3000

## Working prototype features
- Procedurally generated **demo house** in a real Three.js scene (not reconstructed from uploaded photographs)
- Orbit, zoom, hover object names, and click meshes to select semantic component classes
- Choose different colors for siding, roof, trim, and garage
- Stage all choices and apply them together with **Apply My Design**
- Export front/back/left/right PNG screenshots of one consistent demo house (four browser downloads)
- Reference-image file picker only shows the filename; no processing yet

## Not implemented yet
- GPT photo interpretation, image segmentation, house reconstruction from user photos
- Photorealistic AI rendering, actual licensed James Hardie product catalog
- Persistent accounts/projects, ZIP exports

See `docs/ARCHITECTURE.md` for next development stages.

## GPT house-photo analysis (new)

The uploaded photo can now be sent to a **server-side OpenAI Responses API** endpoint for architectural observations. The result panel lists visible components, uncertainties, and additional viewpoints needed to produce a consistent 3D model.

1. Copy `.env.example` to `.env.local`.
2. Replace `replace_with_your_api_key` with an OpenAI Platform API key (API billing may apply).
3. Restart `npm run dev`, upload a real house photo (JPG, PNG, or WebP; up to 8 MB), and click **Analyze house photo**.
4. Review the detected architectural features below the upload area.

The API key is read **only on the server** in `app/api/analyze/route.ts`; never share it in screenshots or commit `.env.local`.

**Scope:** GPT currently produces textual architectural observations, *not pixel-perfect masks or a reconstructed 3D house*. The editable 3D viewer remains a procedural demo. The next stage will turn detected features into segmented surfaces and geometry, with multi-view validation.

