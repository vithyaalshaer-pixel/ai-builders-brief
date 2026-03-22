export type ContentType = "tweet";

export interface FocusArea {
  slug: string;
  label: string;
  keywords: string[];
}

export interface Profile {
  briefName: string;
  ownerName: string;
  language: string;
  timezone: string;
  focusAreas: FocusArea[];
  favoriteBuilders: string[];
  mutedBuilders: string[];
  mutedKeywords: string[];
  maxTweetHighlights: number;
}

export interface DigestItem {
  id: string;
  type: ContentType;
  builder: string;
  title: string;
  summary: string;
  whyItMatters: string;
  originalTitle: string;
  originalBody: string;
  translatedTitle: string;
  translatedBody: string;
  translationProvider: "openai" | "google";
  translationStatus: "translated" | "fallback_google";
  sourcePreviewType: "full_text" | "excerpt";
  sourceUrl: string;
  publishedAt: string;
  score: number;
  engagement: {
    likes: number;
    retweets: number;
    replies: number;
  };
  matchedFocusAreas: string[];
  sourceType: "x";
}

export interface ArchiveEntry {
  date: string;
  title: string;
  summary: string;
  markdownPath: string;
}

export interface LatestDigest {
  date: string;
  generatedAt: string;
  timezone: string;
  title: string;
  summary: string;
  intro: string;
  ownerName: string;
  briefName: string;
  focusAreas: Array<Pick<FocusArea, "slug" | "label">>;
  tweetHighlights: DigestItem[];
  stats: {
    upstreamGeneratedAt: string;
    totalCandidates: number;
    textQualifiedCandidates: number;
    selectedTweets: number;
  };
}

export interface FeedXResponse {
  generatedAt: string;
  lookbackHours: number;
  x: Array<{
    source: "x";
    name: string;
    handle: string;
    bio?: string;
    tweets: Array<{
      id: string;
      text: string;
      createdAt: string;
      url: string;
      likes?: number;
      retweets?: number;
      replies?: number;
      isQuote?: boolean;
      quotedTweetId?: string | null;
    }>;
  }>;
}
