import { loadDigestData } from "../lib/digest/data";

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
            <span>今日入选</span>
            <strong>
              {latest.tweetHighlights.length + latest.podcastHighlights.length}
            </strong>
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
              <p className="eyebrow">X Highlights</p>
              <h2>重点动态</h2>
            </div>
          </div>
          <div className="card-list">
            {latest.tweetHighlights.length === 0 ? (
              <p className="empty-copy">今天没有筛出符合条件的动态。</p>
            ) : (
              latest.tweetHighlights.map((item) => (
                <a key={item.id} href={item.sourceUrl} className="story-card">
                  <div className="story-meta">
                    <span>{item.builder}</span>
                    <span>{formatTime(item.publishedAt, latest.timezone)}</span>
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.summary}</p>
                  <small>{item.whyItMatters}</small>
                </a>
              ))
            )}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Podcast Deep Dives</p>
              <h2>播客深读</h2>
            </div>
          </div>
          <div className="card-list compact">
            {latest.podcastHighlights.length === 0 ? (
              <p className="empty-copy">今天没有筛出符合条件的播客。</p>
            ) : (
              latest.podcastHighlights.map((item) => (
                <a key={item.id} href={item.sourceUrl} className="story-card">
                  <div className="story-meta">
                    <span>{item.builder}</span>
                    <span>{formatTime(item.publishedAt, latest.timezone)}</span>
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.summary}</p>
                  <small>{item.whyItMatters}</small>
                </a>
              ))
            )}
          </div>
        </article>
      </section>
    </main>
  );
}
