import fs from "node:fs/promises";
import path from "node:path";

import profileJson from "../../config/profile.json" with { type: "json" };
import type {
  ArchiveEntry,
  DigestItem,
  FeedPodcastResponse,
  FeedXResponse,
  FocusArea,
  LatestDigest,
  Profile
} from "./types";

const FEED_X_URL =
  "https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-x.json";
const FEED_PODCAST_URL =
  "https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-podcasts.json";

const profile = profileJson as Profile;

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function truncateText(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength - 1).trim()}…`;
}

function formatDigestDate(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function formatDisplayDate(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(iso));
}

function collectFocusMatches(content: string, focusAreas: FocusArea[]): string[] {
  const normalized = normalizeText(content);

  return focusAreas
    .filter((area) =>
      area.keywords.some((keyword) => normalized.includes(normalizeText(keyword)))
    )
    .map((area) => area.label);
}

function isMuted(builder: string, content: string, currentProfile: Profile): boolean {
  const normalizedBuilder = normalizeText(builder);
  const normalizedContent = normalizeText(content);

  if (
    currentProfile.mutedBuilders.some(
      (candidate) => normalizeText(candidate) === normalizedBuilder
    )
  ) {
    return true;
  }

  return currentProfile.mutedKeywords.some((keyword) =>
    normalizedContent.includes(normalizeText(keyword))
  );
}

function engagementScore(item: {
  likes?: number;
  retweets?: number;
  replies?: number;
}): number {
  const total = (item.likes ?? 0) + (item.retweets ?? 0) * 2 + (item.replies ?? 0) * 1.5;
  return Math.log10(total + 1) * 12;
}

function freshnessScore(iso: string, now: Date): number {
  const ageHours = Math.max(
    0,
    (now.getTime() - new Date(iso).getTime()) / (1000 * 60 * 60)
  );

  return Math.max(0, 24 - Math.min(ageHours, 24));
}

function favoriteBuilderScore(builder: string, currentProfile: Profile): number {
  return currentProfile.favoriteBuilders.some(
    (candidate) => normalizeText(candidate) === normalizeText(builder)
  )
    ? 100
    : 0;
}

function focusAreaScore(matchedFocusAreas: string[]): number {
  return matchedFocusAreas.length * 25;
}

function summarizeTweet(builder: string, text: string, matchedFocusAreas: string[]): string {
  const snippet = truncateText(text, 118);
  const focusText =
    matchedFocusAreas.length > 0 ? `，命中主题 ${matchedFocusAreas.join(" / ")}` : "";
  return `${builder} 的最新观点聚焦在可执行的一线经验${focusText}：${snippet}`;
}

function summarizePodcast(
  showName: string,
  title: string,
  transcript: string,
  matchedFocusAreas: string[]
): string {
  const snippet = truncateText(transcript, 120);
  const focusText =
    matchedFocusAreas.length > 0 ? `，与你关注的 ${matchedFocusAreas.join(" / ")} 高相关` : "";
  return `${showName} 这一期讨论《${title}》${focusText}，核心信息是：${snippet}`;
}

function buildWhyItMatters(item: {
  builder: string;
  matchedFocusAreas: string[];
  type: "tweet" | "podcast";
}): string {
  if (item.matchedFocusAreas.length > 0) {
    return `这条${item.type === "tweet" ? "动态" : "播客"}直接覆盖你的关注主题：${item.matchedFocusAreas.join(
      "、"
    )}。`;
  }

  return `${item.builder} 仍然是高信号来源，值得保留在每日观察列表里。`;
}

function sortItems(items: DigestItem[]): DigestItem[] {
  return [...items].sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    if (right.publishedAt !== left.publishedAt) {
      return right.publishedAt.localeCompare(left.publishedAt);
    }

    return left.id.localeCompare(right.id);
  });
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "user-agent": "ai-builders-brief/0.1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

export async function fetchFeeds(): Promise<{
  xFeed: FeedXResponse;
  podcastFeed: FeedPodcastResponse;
}> {
  const [xFeed, podcastFeed] = await Promise.all([
    fetchJson<FeedXResponse>(FEED_X_URL),
    fetchJson<FeedPodcastResponse>(FEED_PODCAST_URL)
  ]);

  return { xFeed, podcastFeed };
}

export function buildDigestFromFeeds(params: {
  profile: Profile;
  xFeed: FeedXResponse;
  podcastFeed: FeedPodcastResponse;
  now?: Date;
}): { latest: LatestDigest; archiveEntry: ArchiveEntry; markdown: string } {
  const now = params.now ?? new Date();
  const date = formatDigestDate(now, params.profile.timezone);

  const tweetCandidates: DigestItem[] = params.xFeed.x.flatMap((account) =>
    account.tweets
      .filter((tweet) => !isMuted(account.name, `${tweet.text} ${account.bio ?? ""}`, params.profile))
      .map((tweet) => {
        const matchedFocusAreas = collectFocusMatches(
          `${tweet.text} ${account.bio ?? ""}`,
          params.profile.focusAreas
        );
        const score =
          favoriteBuilderScore(account.name, params.profile) +
          focusAreaScore(matchedFocusAreas) +
          engagementScore(tweet) +
          freshnessScore(tweet.createdAt, now);

        return {
          id: tweet.id,
          type: "tweet" as const,
          builder: account.name,
          title: truncateText(tweet.text.split("\n")[0] || tweet.text, 80),
          summary: summarizeTweet(account.name, tweet.text, matchedFocusAreas),
          whyItMatters: buildWhyItMatters({
            builder: account.name,
            matchedFocusAreas,
            type: "tweet"
          }),
          sourceUrl: tweet.url,
          publishedAt: tweet.createdAt,
          score: Number(score.toFixed(2)),
          matchedFocusAreas,
          sourceType: "x" as const
        };
      })
  );

  const podcastCandidates: DigestItem[] = params.podcastFeed.podcasts
    .filter((podcast) =>
      !isMuted(
        podcast.name,
        `${podcast.title} ${podcast.transcript ?? ""}`,
        params.profile
      )
    )
    .map((podcast) => {
      const matchedFocusAreas = collectFocusMatches(
        `${podcast.title} ${podcast.transcript ?? ""}`,
        params.profile.focusAreas
      );
      const transcriptBonus = Math.min((podcast.transcript?.length ?? 0) / 240, 20);
      const score =
        favoriteBuilderScore(podcast.name, params.profile) +
        focusAreaScore(matchedFocusAreas) +
        freshnessScore(podcast.publishedAt, now) +
        transcriptBonus;

      return {
        id: podcast.videoId,
        type: "podcast" as const,
        builder: podcast.name,
        title: podcast.title,
        summary: summarizePodcast(
          podcast.name,
          podcast.title,
          podcast.transcript ?? podcast.title,
          matchedFocusAreas
        ),
        whyItMatters: buildWhyItMatters({
          builder: podcast.name,
          matchedFocusAreas,
          type: "podcast"
        }),
        sourceUrl: podcast.url,
        publishedAt: podcast.publishedAt,
        score: Number(score.toFixed(2)),
        matchedFocusAreas,
        sourceType: "podcast" as const
      };
    });

  const tweetHighlights = sortItems(tweetCandidates).slice(0, params.profile.maxTweetHighlights);
  const podcastHighlights = sortItems(podcastCandidates).slice(
    0,
    params.profile.maxPodcastHighlights
  );

  const selectedFocusLabels = new Set<string>();
  [...tweetHighlights, ...podcastHighlights].forEach((item) => {
    item.matchedFocusAreas.forEach((label) => selectedFocusLabels.add(label));
  });

  const selectedFocusAreas = params.profile.focusAreas
    .filter((area) => selectedFocusLabels.size === 0 || selectedFocusLabels.has(area.label))
    .map((area) => ({ slug: area.slug, label: area.label }));

  const leadTweet = tweetHighlights[0];
  const leadPodcast = podcastHighlights[0];
  const summary = leadTweet
    ? `今天最值得看的是 ${leadTweet.builder} 的动态，随后补充 ${podcastHighlights.length} 条播客深读。`
    : leadPodcast
      ? `今天主打播客深读，共整理 ${podcastHighlights.length} 条高相关内容。`
      : "今天没有筛出高信号内容，保留上一版节奏并等待下一轮更新。";

  const intro = `已从 ${tweetCandidates.length + podcastCandidates.length} 条候选内容中，筛出最值得你早上 8 点看的 builder 更新。`;
  const title = `${params.profile.briefName} | ${date}`;

  const latest: LatestDigest = {
    date,
    generatedAt: now.toISOString(),
    timezone: params.profile.timezone,
    title,
    summary,
    intro,
    ownerName: params.profile.ownerName,
    briefName: params.profile.briefName,
    focusAreas: selectedFocusAreas,
    tweetHighlights,
    podcastHighlights,
    stats: {
      upstreamGeneratedAt: [params.xFeed.generatedAt, params.podcastFeed.generatedAt],
      totalCandidates: tweetCandidates.length + podcastCandidates.length,
      selectedTweets: tweetHighlights.length,
      selectedPodcasts: podcastHighlights.length
    }
  };

  const archiveEntry: ArchiveEntry = {
    date,
    title,
    summary,
    markdownPath: `/briefs/${date}.md`
  };

  return {
    latest,
    archiveEntry,
    markdown: renderMarkdown({ latest })
  };
}

export async function readArchive(filePath: string): Promise<ArchiveEntry[]> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as ArchiveEntry[];
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

export function upsertArchive(
  archive: ArchiveEntry[],
  nextEntry: ArchiveEntry
): ArchiveEntry[] {
  const deduped = archive.filter((entry) => entry.date !== nextEntry.date);
  return [nextEntry, ...deduped].sort((left, right) => right.date.localeCompare(left.date));
}

async function writeAtomic(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, content, "utf8");
  await fs.rename(tempPath, filePath);
}

export async function writeOutputs(params: {
  rootDir: string;
  latest: LatestDigest;
  archive: ArchiveEntry[];
  markdown: string;
}): Promise<void> {
  const latestPath = path.join(params.rootDir, "data/digests/latest.json");
  const archivePath = path.join(params.rootDir, "data/digests/archive.json");
  const markdownPath = path.join(params.rootDir, `public/briefs/${params.latest.date}.md`);

  await Promise.all([
    writeAtomic(`${latestPath}`, `${JSON.stringify(params.latest, null, 2)}\n`),
    writeAtomic(`${archivePath}`, `${JSON.stringify(params.archive, null, 2)}\n`),
    writeAtomic(markdownPath, params.markdown)
  ]);
}

export function renderMarkdown(params: { latest: LatestDigest }): string {
  const { latest } = params;
  const lines = [
    `# ${latest.title}`,
    "",
    latest.summary,
    "",
    `- 生成时间：${formatDisplayDate(latest.generatedAt, latest.timezone)}`,
    `- 时区：${latest.timezone}`,
    `- 候选内容：${latest.stats.totalCandidates}`,
    "",
    "## 重点动态",
    ""
  ];

  if (latest.tweetHighlights.length === 0) {
    lines.push("今天没有筛出符合条件的 X 动态。", "");
  } else {
    latest.tweetHighlights.forEach((item, index) => {
      lines.push(`### ${index + 1}. ${item.builder}`);
      lines.push("");
      lines.push(`- 标题：${item.title}`);
      lines.push(`- 摘要：${item.summary}`);
      lines.push(`- 为什么重要：${item.whyItMatters}`);
      lines.push(`- 发布时间：${formatDisplayDate(item.publishedAt, latest.timezone)}`);
      lines.push(`- 来源：${item.sourceUrl}`);
      lines.push("");
    });
  }

  lines.push("## 播客深读", "");

  if (latest.podcastHighlights.length === 0) {
    lines.push("今天没有筛出符合条件的播客。", "");
  } else {
    latest.podcastHighlights.forEach((item, index) => {
      lines.push(`### ${index + 1}. ${item.title}`);
      lines.push("");
      lines.push(`- 节目：${item.builder}`);
      lines.push(`- 摘要：${item.summary}`);
      lines.push(`- 为什么重要：${item.whyItMatters}`);
      lines.push(`- 发布时间：${formatDisplayDate(item.publishedAt, latest.timezone)}`);
      lines.push(`- 来源：${item.sourceUrl}`);
      lines.push("");
    });
  }

  return `${lines.join("\n")}\n`;
}

export function loadProfile(): Profile {
  return profile;
}
