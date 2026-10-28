import { GoogleGenAI, Type } from '@google/genai';
import type { CorridorNote } from '../types.js';

interface CachedCorridorNote {
  note: CorridorNote;
  timestamp: number;
}

const geminiCache = new Map<string, CachedCorridorNote>();
const GEMINI_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Generates an optional corridor summary note using Gemini.
 * Never throws an error or blocks the search.
 * Times out strictly after 8 seconds.
 */
export async function generateCorridorNote(
  originName: string,
  destinationName: string,
  distanceKm: number
): Promise<CorridorNote | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }

  const cacheKey = `${originName.toLowerCase()}->${destinationName.toLowerCase()}`;
  const cached = geminiCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < GEMINI_CACHE_TTL_MS) {
    return cached.note;
  }

  const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const prompt = `Provide brief corridor transit information for bus travelers between ${originName} and ${destinationName} (distance roughly ${distanceKm} km). Return a JSON object with:
    - title: short headline (e.g., "${originName} to ${destinationName} Transit Corridor")
    - summary: 2-3 sentences covering route terrain/highways, peak travel times, and general connectivity.
    - highlights: list of 3-4 bullet points (highway names, typical travel conditions, major transit halts).
    - sources: list of 1-3 source references (e.g., "State Highway Authority", "Regional Transport Offices")`;

    // 8 second timeout race
    const timeoutPromise = new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error('Gemini timeout')), 8000)
    );

    const callPromise = ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            summary: { type: Type.STRING },
            highlights: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            sources: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ['title', 'summary', 'highlights'],
        },
      },
    });

    const response = (await Promise.race([callPromise, timeoutPromise])) as any;
    if (!response || !response.text) {
      return null;
    }

    const parsed = JSON.parse(response.text.trim()) as CorridorNote;
    if (parsed && parsed.title && parsed.summary) {
      const sanitized: CorridorNote = {
        title: parsed.title,
        summary: parsed.summary,
        highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
        sources: Array.isArray(parsed.sources) ? parsed.sources : ['Regional Transport Estimates'],
      };
      geminiCache.set(cacheKey, { note: sanitized, timestamp: Date.now() });
      return sanitized;
    }
  } catch {
    // Gracefully handle timeout or API issues without throwing
  }

  return null;
}
