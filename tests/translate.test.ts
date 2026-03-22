import test from "node:test";
import assert from "node:assert/strict";

import { createEnvironmentTranslator } from "../lib/digest/translate";

const env = {
  OPENAI_API_KEY: "test-openai",
  OPENAI_TRANSLATION_MODEL: "gpt-test",
  GOOGLE_TRANSLATE_API_KEY: "test-google",
  NODE_ENV: "test"
} as unknown as NodeJS.ProcessEnv;

test("translator prefers OpenAI when it succeeds", async () => {
  const translator = createEnvironmentTranslator(
    env,
    (async (input: RequestInfo | URL) => {
      if (String(input).includes("api.openai.com")) {
        return new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              translatedTitle: "中文标题",
              translatedBody: "中文正文"
            })
          }),
          { status: 200 }
        );
      }

      throw new Error("Google should not be called");
    }) as typeof fetch
  );

  const result = await translator.translate({
    builder: "Builder",
    sourceType: "tweet",
    originalTitle: "Original title",
    originalBody: "Original body",
    targetLanguage: "zh-CN"
  });

  assert.equal(result.translationProvider, "openai");
  assert.equal(result.translatedTitle, "中文标题");
});

test("translator falls back to Google when OpenAI fails", async () => {
  const translator = createEnvironmentTranslator(
    env,
    (async (input: RequestInfo | URL) => {
      if (String(input).includes("api.openai.com")) {
        return new Response("upstream error", { status: 500, statusText: "fail" });
      }

      return new Response(
        JSON.stringify({
          data: {
            translations: [
              { translatedText: "谷歌标题" },
              { translatedText: "谷歌正文" }
            ]
          }
        }),
        { status: 200 }
      );
    }) as typeof fetch
  );

  const result = await translator.translate({
    builder: "Builder",
    sourceType: "tweet",
    originalTitle: "Original title",
    originalBody: "Original body",
    targetLanguage: "zh-CN"
  });

  assert.equal(result.translationProvider, "google");
  assert.equal(result.translationStatus, "fallback_google");
  assert.equal(result.translatedBody, "谷歌正文");
});

test("translator throws when both providers fail", async () => {
  const translator = createEnvironmentTranslator(
    env,
    (async () => new Response("boom", { status: 500, statusText: "fail" })) as typeof fetch
  );

  await assert.rejects(
    translator.translate({
      builder: "Builder",
      sourceType: "tweet",
      originalTitle: "Original title",
      originalBody: "Original body",
      targetLanguage: "zh-CN"
    }),
    /Translation failed/
  );
});
