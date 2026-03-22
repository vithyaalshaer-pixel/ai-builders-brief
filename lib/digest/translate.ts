import type { ContentType } from "./types";

export interface TranslationRequest {
  builder: string;
  sourceType: ContentType;
  originalTitle: string;
  originalBody: string;
  targetLanguage: string;
}

export interface TranslationResult {
  translatedTitle: string;
  translatedBody: string;
  translationProvider: "openai" | "google";
  translationStatus: "translated" | "fallback_google";
}

export interface Translator {
  translate(request: TranslationRequest): Promise<TranslationResult>;
}

interface TranslatorConfig {
  openaiApiKey: string;
  openaiModel: string;
  googleTranslateApiKey: string;
  fetchFn: typeof fetch;
}

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function getTargetLanguageLabel(targetLanguage: string): string {
  if (targetLanguage.toLowerCase() === "zh-cn") {
    return "Simplified Chinese";
  }

  return targetLanguage;
}

function getGoogleTargetLanguage(targetLanguage: string): string {
  if (targetLanguage.toLowerCase() === "zh-cn") {
    return "zh-CN";
  }

  return targetLanguage;
}

function extractOpenAIOutputText(payload: unknown): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "output_text" in payload &&
    typeof payload.output_text === "string"
  ) {
    return payload.output_text;
  }

  if (
    typeof payload === "object" &&
    payload !== null &&
    "output" in payload &&
    Array.isArray(payload.output)
  ) {
    const texts = payload.output
      .flatMap((entry) =>
        typeof entry === "object" && entry !== null && "content" in entry && Array.isArray(entry.content)
          ? entry.content
          : []
      )
      .map((content) =>
        typeof content === "object" && content !== null && "text" in content
          ? content.text
          : undefined
      )
      .filter((value): value is string => typeof value === "string");

    if (texts.length > 0) {
      return texts.join("\n").trim();
    }
  }

  throw new Error("OpenAI translation response did not contain output_text");
}

function parseTranslationPayload(raw: string): Pick<TranslationResult, "translatedTitle" | "translatedBody"> {
  const parsed = JSON.parse(raw) as {
    translatedTitle?: unknown;
    translatedBody?: unknown;
  };

  if (
    typeof parsed.translatedTitle !== "string" ||
    parsed.translatedTitle.trim().length === 0 ||
    typeof parsed.translatedBody !== "string" ||
    parsed.translatedBody.trim().length === 0
  ) {
    throw new Error("Translation response JSON is missing translatedTitle or translatedBody");
  }

  return {
    translatedTitle: decodeHtmlEntities(parsed.translatedTitle.trim()),
    translatedBody: decodeHtmlEntities(parsed.translatedBody.trim())
  };
}

async function translateWithOpenAI(
  config: TranslatorConfig,
  request: TranslationRequest
): Promise<TranslationResult> {
  const response = await config.fetchFn("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.openaiApiKey}`
    },
    body: JSON.stringify({
      model: config.openaiModel,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                "You are a professional translator for AI news digests.",
                `Translate the title and body into ${getTargetLanguageLabel(request.targetLanguage)}.`,
                "Return strict JSON with keys translatedTitle and translatedBody.",
                "Preserve URLs, @handles, code symbols, product names, and numbers.",
                "Keep the tone clear, concise, and natural for Chinese readers.",
                "",
                JSON.stringify({
                  builder: request.builder,
                  sourceType: request.sourceType,
                  originalTitle: request.originalTitle,
                  originalBody: request.originalBody
                })
              ].join("\n")
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_object"
        }
      },
      max_output_tokens: 1400
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI translation failed: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  const outputText = extractOpenAIOutputText(payload);
  const parsed = parseTranslationPayload(outputText);

  return {
    ...parsed,
    translationProvider: "openai",
    translationStatus: "translated"
  };
}

async function translateWithGoogle(
  config: TranslatorConfig,
  request: TranslationRequest
): Promise<TranslationResult> {
  const response = await config.fetchFn(
    `https://translation.googleapis.com/language/translate/v2?key=${config.googleTranslateApiKey}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        q: [request.originalTitle, request.originalBody],
        target: getGoogleTargetLanguage(request.targetLanguage),
        format: "text"
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Google translation failed: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as {
    data?: {
      translations?: Array<{
        translatedText?: string;
      }>;
    };
  };

  const translations = payload.data?.translations ?? [];
  const translatedTitle = translations[0]?.translatedText;
  const translatedBody = translations[1]?.translatedText;

  if (!translatedTitle || !translatedBody) {
    throw new Error("Google translation response did not contain both title and body");
  }

  return {
    translatedTitle: decodeHtmlEntities(translatedTitle),
    translatedBody: decodeHtmlEntities(translatedBody),
    translationProvider: "google",
    translationStatus: "fallback_google"
  };
}

export function createEnvironmentTranslator(
  env: NodeJS.ProcessEnv = process.env,
  fetchFn: typeof fetch = fetch
): Translator {
  const config: TranslatorConfig = {
    openaiApiKey: requireEnv("OPENAI_API_KEY", env.OPENAI_API_KEY),
    openaiModel: requireEnv("OPENAI_TRANSLATION_MODEL", env.OPENAI_TRANSLATION_MODEL),
    googleTranslateApiKey: requireEnv(
      "GOOGLE_TRANSLATE_API_KEY",
      env.GOOGLE_TRANSLATE_API_KEY
    ),
    fetchFn
  };

  return {
    async translate(request) {
      try {
        return await translateWithOpenAI(config, request);
      } catch (openAiError) {
        try {
          return await translateWithGoogle(config, request);
        } catch (googleError) {
          throw new Error(
            `Translation failed for ${request.builder}: ${String(openAiError)} | ${String(googleError)}`
          );
        }
      }
    }
  };
}
