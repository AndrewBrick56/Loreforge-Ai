import "server-only";
import OpenAI from "openai";

/** Converts API failures into safe user-facing messages. */
export function mapGenerationError(
  err: unknown,
): { error: string; code: string } {
  if (err instanceof OpenAI.APIError) {
    // Temporary diagnostics to identify the actual failure.
    console.error("[LoreForge] OpenAI API diagnostic:", {
      status: err.status,
      type: err.type,
      code: err.code,
      param: err.param,
      message: err.message.slice(0, 700),
      requestId: err.requestID,
    });

    if (err.status === 400) {
      return {
        error:
          "The generation model rejected this request. Check the server diagnostic for details.",
        code: "MODEL_REJECTED",
      };
    }

    if (err.status === 401 || err.status === 403) {
      return {
        error:
          "The server's OpenAI credentials are invalid or lack access to this model.",
        code: "AUTH_ERROR",
      };
    }

    if (err.status === 429) {
      return {
        error:
          "OpenAI's rate limit or available quota was reached. Check your API usage and billing.",
        code: "UPSTREAM_RATE_LIMITED",
      };
    }
  }

  // Preserve the existing fallback for unexpected failures.
  console.error("[LoreForge] Image generation failed:", err);

  return {
    error: "Image generation failed unexpectedly. Please try again.",
    code: "GENERATION_FAILED",
  };
}

export function statusForGenerationError(
  err: unknown,
): number {
  if (
    err instanceof OpenAI.APIError &&
    typeof err.status === "number"
  ) {
    if ([400, 401, 403, 404, 429].includes(err.status)) {
      return err.status;
    }
  }

  return 502;
}