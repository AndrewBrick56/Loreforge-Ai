import "server-only";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { getOpenAIClient } from "./client";
import type { ArtStyle } from "@/types/character";
import { STYLE_PROMPT_FRAGMENTS } from "./style-prompts";

const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || "gpt-6-luna";

const TokenIdeaSchema = z.object({
  name: z.string().describe("A fun, memorable memecoin project name, e.g. 'Chairman Pigeon'."),
  ticker: z
    .string()
    .describe("A 3-6 uppercase-letter ticker with no '$' prefix and no spaces, e.g. 'CPGN'."),
  rationale: z.string().describe("One short, punchy sentence on why this name/ticker fits the character."),
});

const TokenIdeasSchema = z.object({
  ideas: z.array(TokenIdeaSchema).length(5),
});

export type TokenIdea = z.infer<typeof TokenIdeaSchema>;

/**
 * Pure creative brainstorming — text only, nothing on-chain, nothing saved
 * automatically. This is deliberately separate from character_tokens
 * (associating a REAL existing mint address), which is validated on-chain
 * in src/lib/solana/mint.ts. Suggesting a name here is not launching or
 * registering anything.
 */
export async function generateTokenIdeas(params: {
  characterName: string;
  style: ArtStyle;
  personality?: string;
}): Promise<TokenIdea[]> {
  const response = await getOpenAIClient().responses.parse({
    model: TEXT_MODEL,
    input: [
      {
        role: "system",
        content:
          "You brainstorm fun, punchy memecoin project names and tickers for a character-based AI platform called LoreForge. Keep it playful and crypto-native in tone. Tickers are 3-6 uppercase letters, no '$' prefix. Never claim these are real, registered, or launched tokens — they are creative suggestions only.",
      },
      {
        role: "user",
        content: `Character: ${params.characterName}\nVisual style: ${STYLE_PROMPT_FRAGMENTS[params.style]}${
          params.personality ? `\nPersonality: ${params.personality}` : ""
        }\n\nSuggest 5 distinct memecoin name + ticker ideas for this character.`,
      },
    ],
    text: { format: zodTextFormat(TokenIdeasSchema, "token_ideas") },
  });

  if (!response.output_parsed) throw new Error("The idea model did not return parseable suggestions.");
  return response.output_parsed.ideas;
}
