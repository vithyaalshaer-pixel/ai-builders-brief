import test from "node:test";
import assert from "node:assert/strict";

import { buildDigestFromFeeds, upsertArchive } from "../lib/digest/generate";
import type { Translator } from "../lib/digest/translate";
import type { FeedPodcastResponse, FeedXResponse, Profile } from "../lib/digest/types";

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
  maxTweetHighlights: 3,
  maxPodcastHighlights: 2
};

function buildFeeds(): { xFeed: FeedXResponse; podcastFeed: FeedPodcastResponse } {
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
              text: "A new agent workflow is shipping today",
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
    },
    podcastFeed: {
      generatedAt: "2026-03-20T06:52:54.016Z",
      lookbackHours: 72,
      podcasts: [
        {
          source: "podcast",
          name: "Builders FM",
          title: "The next model wave",
          videoId: "video-1",
          url: "https://youtube.com/watch?v=video-1",
          publishedAt: "2026-03-19T10:00:00.000Z",
          transcript:
            "This episode talks about model quality and agent workflows. ".repeat(25)
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
  assert.equal(result.latest.tweetHighlights[0]?.originalBody, "A new agent workflow is shipping today");
  assert.match(result.latest.tweetHighlights[0]?.translatedBody ?? "", /^CN:/);
  assert.equal(result.latest.tweetHighlights[0]?.translationProvider, "openai");
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
    podcastFeed: { generatedAt: "2026-03-20T00:00:00.000Z", lookbackHours: 72, podcasts: [] },
    translator,
    now: new Date("2026-03-20T08:00:00.000Z")
  });

  assert.equal(result.latest.tweetHighlights.length, 0);
  assert.equal(result.latest.podcastHighlights.length, 0);
  assert.match(result.latest.summary, /没有筛出高信号内容/);
});

test("podcast excerpt stays within the long-form preview window", async () => {
  const result = await buildDigestFromFeeds({
    profile: { ...profile, favoriteBuilders: [] },
    ...buildFeeds(),
    translator,
    now: new Date("2026-03-20T08:00:00.000Z")
  });

  const excerpt = result.latest.podcastHighlights[0]?.originalBody ?? "";
  assert.ok(excerpt.length >= 800);
  assert.ok(excerpt.length <= 1201);
  assert.equal(result.latest.podcastHighlights[0]?.sourcePreviewType, "excerpt");
});
