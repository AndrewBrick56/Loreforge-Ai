import "server-only";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { getOpenAIClient } from "./client";
import type { ArtStyle } from "@/types/character";
import { STYLE_PROMPT_FRAGMENTS } from "./style-prompts";

// GPT-6 Luna is the fast/affordable tier of OpenAI's current model family —
// plenty for a short, fun character bio, and much cheaper than the Astra
// flagship. Override with OPENAI_TEXT_MODEL if you want higher-quality
// writing (e.g. gpt-6-sol or gpt-6-astra) at higher cost.
const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || "gpt-6-luna";

const CharacterProfileSchema = z.object({
  name: z.string().describe("A fitting, fun character name — not the literal subject (e.g. not just 'Pigeon')."),
  title: z.string().describe("A short epithet or title, e.g. 'The Self-Made Skyline Tycoon'."),
  personality: z.string().describe("1-2 sentences describing the character's personality."),
  catchphrase: z.string().describe("A short, quotable catchphrase in the character's voice."),
  originStory: z.string().describe("A fun, concise origin story, 2-4 sentences."),
  likes: z.array(z.string()).min(2).max(5).describe("Short phrases, e.g. 'artisanal birdseed'."),
  dislikes: z.array(z.string()).min(2).max(5).describe("Short phrases."),
});

export type GeneratedCharacterProfile = z.infer<typeof CharacterProfileSchema>;

interface GenerateIdentityParams {
  description: string;
  style: ArtStyle;
}

export async function generateCharacterIdentity({
  description,
  style,
}: GenerateIdentityParams): Promise<GeneratedCharacterProfile> {
  const response = await getOpenAIClient().responses.parse({
    model: TEXT_MODEL,
    input: [
      {
        role: "system",
        content:
          "You invent entertaining, concise fictional character identities for an AI character-creation app called LoreForge. Keep everything punchy and fun, never generic. Never mention that you are an AI or reference the image-generation process.",
      },
      {
        role: "user",
        content: `Character concept: ${description}\nVisual style: ${STYLE_PROMPT_FRAGMENTS[style]}\n\nInvent a complete character identity for this.`,
      },
    ],
    text: {
      format: zodTextFormat(CharacterProfileSchema, "character_profile"),
    },
  });

  if (!response.output_parsed) {
    throw new Error("The identity model did not return a parseable profile.");
  }

  return response.output_parsed;
}
