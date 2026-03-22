import { loadDigestData } from "../lib/digest/data";
import type { DigestItem } from "../lib/digest/types";

function getTranslatedTitle(item: Partial<DigestItem>): string {
  return item.translatedTitle || item.title || "Untitled";
}

function getTranslatedBody(item: Partial<DigestItem>): string {
  return item.translatedBody || item.summary || "";
}

function getOriginalTitle(item: Partial<DigestItem>): string {
  return item.originalTitle || item.title || "Untitled";
}

function getOriginalBody(item: Partial<DigestItem>): string {
  return item.originalBody || item.summary || "";
}

function getTranslationLabel(item: Partial<DigestItem>): string {
  return item.translationProvider === "google" ? "Google fallback" : "OpenAI";
}

function formatEngagement(item: DigestItem): string {
  const likes = item.engagement?.likes ?? 0;
  const reposts = item.engagement?.retweets ?? 0;
  const replies = item.engagement?.replies ?? 0;
  return `${likes} Likes / ${reposts} Reposts / ${replies} Replies`;
}

function formatTime(iso: string, timezone: string): string {
  if (!iso) {
    return "-";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(iso));
}

export default async function HomePage() {
  const rootDir = process.cwd();
  const { latest, archive } = await loadDigestData(rootDir);

  if (!latest) {
    return (
      <main className="shell">
        <section className="hero empty-state">
          <p className="eyebrow">AI Builders Daily</p>
          <h1>简报还没生成</h1>
          <p>先运行 `npm run generate`，或者等待 GitHub Action 生成首期内容。</p>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">{latest.briefName}</p>
          <h1>{latest.title}</h1>
          <p className="lede">{latest.summary}</p>
        </div>
        <div className="hero-meta">
          <div className="metric">
            <span>生成时间</span>
            <strong>{formatTime(latest.generatedAt, latest.timezone)}</strong>
          </div>
          <div className="metric">
            <span>候选内容</span>
            <strong>{latest.stats.totalCandidates}</strong>
          </div>
          <div className="metric">
            <span>纯文字候选</span>
            <strong>{latest.stats.textQualifiedCandidates ?? latest.stats.totalCandidates}</strong>
          </div>
          <div className="metric">
            <span>今日入选</span>
            <strong>{latest.tweetHighlights.length}</strong>
          </div>
        </div>
      </section>

      <section className="section-grid">
        <article className="panel panel-wide">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Focus</p>
              <h2>关注主题</h2>
            </div>
            <p>{latest.intro}</p>
          </div>
          <div className="tag-row">
            {latest.focusAreas.map((area) => (
              <span key={area.slug} className="tag">
                {area.label}
              </span>
            ))}
          </div>
        </article>

        <article className="panel">
          <p className="eyebrow">Archive</p>
          <h2>最近几期</h2>
          <div className="archive-list">
            {archive.length === 0 ? (
              <p className="empty-copy">生成首期简报后，这里会出现历史归档。</p>
            ) : (
              archive.slice(0, 5).map((entry) => (
                <a key={entry.date} href={entry.markdownPath} className="archive-item">
                  <strong>{entry.date}</strong>
                  <span>{entry.summary}</span>
                </a>
              ))
            )}
          </div>
        </article>
      </section>

      <section className="section-grid">
        <article className="panel panel-wide">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Builder Text Signals</p>
              <h2>重点文字动态</h2>
            </div>
          </div>
          <div className="brief-list">
            {latest.tweetHighlights.length === 0 ? (
              <p className="empty-copy">今天没有筛出符合条件的文字动态。</p>
            ) : (
              latest.tweetHighlights.map((item) => (
                <article key={item.id} className="brief-card">
                  <div className="brief-card-head">
                    <span className="brief-index">{item.builder}</span>
                    <span className="provider-badge">{getTranslationLabel(item)}</span>
                  </div>
                  <h3>{getTranslatedTitle(item)}</h3>
                  <div className="brief-detail-list">
                    <p><span>Builder：</span>{item.builder}</p>
                    <p>
                      <span>原帖地址：</span>
                      <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                        {item.sourceUrl}
                      </a>
                    </p>
                    <p><span>发布时间：</span>{formatTime(item.publishedAt, latest.timezone)}</p>
                    <p><span>当前热度：</span>{formatEngagement(item)}</p>
                    <p><span>命中标签：</span>{item.matchedFocusAreas.length > 0 ? item.matchedFocusAreas.join("、") : "通用 AI Builder 动态"}</p>
                    <p><span>推荐语：</span>{item.summary}</p>
                    <p><span>推荐原因：</span>{item.whyItMatters}</p>
                    <p><span>中文正文：</span></p>
                  </div>
                  <p className="translated-copy brief-body">{getTranslatedBody(item)}</p>
                  <details className="source-details">
                    <summary>查看英文原文</summary>
                    <div className="source-original">
                      <strong>{getOriginalTitle(item)}</strong>
                      <p>{getOriginalBody(item)}</p>
                    </div>
                  </details>
                </article>
              ))
            )}
          </div>
        </article>
      </section>
    </main>
  );
}
