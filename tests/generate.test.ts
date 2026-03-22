import test from "node:test";
import assert from "node:assert/strict";

import { buildDigestFromFeeds, upsertArchive } from "../lib/digest/generate";
import type { Translator } from "../lib/digest/translate";
import type { FeedXResponse, Profile } from "../lib/digest/types";

const profile: Profile = {
  briefName: "Test",
  ownerName: "Tester",
  language: "zh-CN",
  timezone: "Asia/Shanghai",
  focusAreas: [
    { slug: "agents", label: "Agents", keywords: ["agent"] },
    { slug: "models", label: "Models", keywords: ["model"] }
  ],
  favoriteBuilders: ["Favorite Builder"],
  mutedBuilders: ["Muted Builder"],
  mutedKeywords: ["ignore-me"],
  maxTweetHighlights: 3
};

function buildFeeds(): { xFeed: FeedXResponse } {
  return {
    xFeed: {
      generatedAt: "2026-03-20T06:52:33.100Z",
      lookbackHours: 24,
      x: [
        {
          source: "x",
          name: "Favorite Builder",
          handle: "favorite",
          bio: "ships agent workflows",
          tweets: [
            {
              id: "1",
              text: "A new agent workflow is shipping today with repo context, evaluation gates, task routing, and deployment checks built directly into the loop.",
              createdAt: "2026-03-20T06:00:00.000Z",
              url: "https://x.com/favorite/status/1",
              likes: 10,
              retweets: 2,
              replies: 1
            }
          ]
        },
        {
          source: "x",
          name: "Muted Builder",
          handle: "muted",
          tweets: [
            {
              id: "2",
              text: "This should never appear",
              createdAt: "2026-03-20T04:00:00.000Z",
              url: "https://x.com/muted/status/2",
              likes: 999
            }
          ]
        },
        {
          source: "x",
          name: "Other Builder",
          handle: "other",
          tweets: [
            {
              id: "3",
              text: "ignore-me but about model releases",
              createdAt: "2026-03-20T03:00:00.000Z",
              url: "https://x.com/other/status/3",
              likes: 200
            }
          ]
        }
      ]
    }
  };
}

const translator: Translator = {
  async translate(request) {
    return {
      translatedTitle: `CN:${request.originalTitle}`,
      translatedBody: `CN:${request.originalBody}`,
      translationProvider: "openai",
      translationStatus: "translated"
    };
  }
};

test("favorite builders outrank plain keyword matches", async () => {
  const result = await buildDigestFromFeeds({
    profile,
    ...buildFeeds(),
    translator,
    now: new Date("2026-03-20T08:00:00.000Z")
  });

  assert.equal(result.latest.tweetHighlights[0]?.builder, "Favorite Builder");
  assert.equal(result.latest.tweetHighlights.length, 1);
  assert.match(
    result.latest.tweetHighlights[0]?.originalBody ?? "",
    /agent workflow is shipping today/
  );
  assert.match(result.latest.tweetHighlights[0]?.translatedBody ?? "", /^CN:/);
  assert.equal(result.latest.tweetHighlights[0]?.translationProvider, "openai");
  assert.deepEqual(result.latest.tweetHighlights[0]?.engagement, {
    likes: 10,
    retweets: 2,
    replies: 1
  });
});

test("archive upsert replaces the same date and keeps reverse chronological order", () => {
  const archive = upsertArchive(
    [
      { date: "2026-03-18", title: "Old", summary: "A", markdownPath: "/briefs/2026-03-18.md" },
      { date: "2026-03-20", title: "Old Today", summary: "B", markdownPath: "/briefs/2026-03-20.md" }
    ],
    {
      date: "2026-03-20",
      title: "New Today",
      summary: "C",
      markdownPath: "/briefs/2026-03-20.md"
    }
  );

  assert.deepEqual(
    archive.map((entry) => entry.title),
    ["New Today", "Old"]
  );
});

test("empty candidates still produce a stable digest", async () => {
  const result = await buildDigestFromFeeds({
    profile: { ...profile, favoriteBuilders: [], mutedKeywords: [], mutedBuilders: [] },
    xFeed: { generatedAt: "2026-03-20T00:00:00.000Z", lookbackHours: 24, x: [] },
    translator,
    now: new Date("2026-03-20T08:00:00.000Z")
  });

  assert.equal(result.latest.tweetHighlights.length, 0);
  assert.equal(result.latest.stats.textQualifiedCandidates, 0);
  assert.match(result.latest.summary, /没有筛出足够高信号的文字动态/);
});

test("short text-only posts are filtered out when they are not substantial enough", async () => {
  const result = await buildDigestFromFeeds({
    profile: { ...profile, favoriteBuilders: [] },
    xFeed: {
      generatedAt: "2026-03-20T06:52:33.100Z",
      lookbackHours: 24,
      x: [
        {
          source: "x",
          name: "Builder",
          handle: "builder",
          tweets: [
            {
              id: "short",
              text: "shipping now https://t.co/demo",
              createdAt: "2026-03-20T06:00:00.000Z",
              url: "https://x.com/builder/status/short",
              likes: 99
            },
            {
              id: "long",
              text: "We shipped a new coding agent workflow today with task routing, repository context, guardrails, test replay, and deployment checks built into the loop.",
              createdAt: "2026-03-20T05:00:00.000Z",
              url: "https://x.com/builder/status/long",
              likes: 40
            }
          ]
        }
      ]
    },
    translator,
    now: new Date("2026-03-20T08:00:00.000Z")
  });

  assert.equal(result.latest.stats.totalCandidates, 2);
  assert.equal(result.latest.stats.textQualifiedCandidates, 1);
  assert.equal(result.latest.tweetHighlights.length, 1);
  assert.equal(result.latest.tweetHighlights[0]?.id, "long");
});
