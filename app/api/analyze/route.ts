import { NextRequest, NextResponse } from "next/server";
import { fetchGeminiWithRetry } from "../../../lib/gemini-retry";
import {readHousePhotos, photoParts} from "../../../lib/house-photos";

export const runtime = "nodejs";
export const maxDuration = 180;

const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

type Observation = {
  component: string;
  count: number;
  notes: string;
  confidence: "high" | "medium" | "low";
};

type Analysis = {
  building_summary: string;
  photo_view: string;
  visible_components: Observation[];
  missing_views: string[];
  reconstruction_notes: string[];
};

// The frontend expects this same JSON shape, regardless of which model provides it.
const responseSchema = {
  type: "OBJECT",
  properties: {
    building_summary: { type: "STRING" },
    photo_view: { type: "STRING" },
    visible_components: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          component: { type: "STRING" },
          count: { type: "INTEGER" },
          notes: { type: "STRING" },
          confidence: { type: "STRING", enum: ["high", "medium", "low"] },
        },
        required: ["component", "count", "notes", "confidence"],
      },
    },
    missing_views: { type: "ARRAY", items: { type: "STRING" } },
    reconstruction_notes: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: [
    "building_summary",
    "photo_view",
    "visible_components",
    "missing_views",
    "reconstruction_notes",
  ],
} as const;

function validAnalysis(data: unknown): data is Analysis {
  if (!data || typeof data !== "object") return false;
  const a = data as Partial<Analysis>;
  return (
    typeof a.building_summary === "string" &&
    typeof a.photo_view === "string" &&
    Array.isArray(a.missing_views) &&
    a.missing_views.every((s) => typeof s === "string") &&
    Array.isArray(a.reconstruction_notes) &&
    a.reconstruction_notes.every((s) => typeof s === "string") &&
    Array.isArray(a.visible_components) &&
    a.visible_components.every(
      (item) =>
        item &&
        typeof item.component === "string" &&
        Number.isInteger(item.count) &&
        typeof item.notes === "string" &&
        ["high", "medium", "low"].includes(item.confidence)
    )
  );
}

export async function POST(request: NextRequest) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is missing. Add it to .env.local and restart npm run dev." },
      { status: 503 }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected a multipart/form-data image upload." },
      { status: 400 }
    );
  }

  let photos:Awaited<ReturnType<typeof readHousePhotos>>;
  try{photos=await readHousePhotos(form)}catch(e){
    return NextResponse.json({error:e instanceof Error?e.message:"Invalid photos."},{status:400});
  }
  const model=process.env.GEMINI_MODEL||"gemini-3.5-flash-lite";

  try {
    const response = await fetchGeminiWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: "Analyze 1 to 4 real exterior photos of the SAME house. Use the labeled viewpoints. Preserve the facade seen in the FRONT photo as the primary design reference; do not average distinct sides into a generic facade. Identify only observed architectural elements, including arches, shutters, windows, trim, garage, gutters, rooflines, style, and occlusions. Distinguish confirmed multiple-view observations from unseen/estimated geometry. Summarize visible features and remaining necessary viewpoints. Never invent exact measurements, hidden details, brand identity, segmentation masks or a finished 3D reconstruction. If the inputs are not house photos, return an empty feature list.",
                },
                ...photoParts(photos),
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema,
            maxOutputTokens: 1500,
            temperature: 0.2,
          },
        }),
      }
    );

    const payload = await response.json();
    if (!response.ok) {
      const errorCode = payload?.error?.status;
      const providerMessage = String(payload?.error?.message || "");
      if (response.status === 429 || errorCode === "RESOURCE_EXHAUSTED") {
        return NextResponse.json(
          { error: "Gemini's free-tier request limit was reached. Check your Google AI Studio limits and retry later." },
          { status: 429 }
        );
      }
      if (response.status === 400 || response.status === 404) {
        return NextResponse.json(
          { error: `Gemini returned ${response.status} for model "${model}": ${providerMessage.slice(0, 450) || "Check model access and request format."}` },
          { status: 502 }
        );
      }
      console.error("Gemini analysis API failed:", response.status, errorCode, providerMessage);
      // A provider message may contain sensitive request information. Return only
      // safe, actionable status details to the browser; keep diagnostics server-side.
      if (response.status === 503 || response.status === 502 || response.status === 504) {
        return NextResponse.json({ error: "Gemini is temporarily overloaded. Retried the request twice without success. Please try again later." }, { status: 503 });
      }
      if (response.status === 401 || response.status === 403) {
        return NextResponse.json(
          { error: `Gemini access denied (HTTP ${response.status}, ${errorCode || "permission error"}) for "${model}". Verify your API key, project API access, and model availability in Google AI Studio. Check the terminal for details.` },
          { status: 502 }
        );
      }
      return NextResponse.json(
        { error: `Gemini service error (HTTP ${response.status}, ${errorCode || "provider error"}) for "${model}". See the VS Code terminal for details.` },
        { status: 502 }
      );
    }

    const raw = payload?.candidates?.[0]?.content?.parts
      ?.filter((part: { text?: string }) => typeof part.text === "string")
      .map((part: { text: string }) => part.text)
      .join("");

    if (!raw) {
      return NextResponse.json(
        { error: "Gemini returned no architectural observations. Try another photo." },
        { status: 502 }
      );
    }

    let analysis: unknown;
    try {
      analysis = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "Gemini returned an unreadable result. Please retry." },
        { status: 502 }
      );
    }
    if (!validAnalysis(analysis)) {
      return NextResponse.json(
        { error: "Gemini returned incomplete architectural data. Please retry." },
        { status: 502 }
      );
    }

    return NextResponse.json({ analysis, model, views:photos.map(p=>p.view),photo_count:photos.length });
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Gemini timed out after two attempts. The provider may be overloaded; please retry."
        : "Unable to analyze image. Check the development server logs.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
