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
