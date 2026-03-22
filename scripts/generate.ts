import path from "node:path";

import {
  buildDigestFromFeeds,
  fetchFeeds,
  loadProfile,
  readArchive,
  upsertArchive,
  writeOutputs
} from "../lib/digest/generate";
import { createEnvironmentTranslator } from "../lib/digest/translate";

async function main(): Promise<void> {
  const rootDir = process.cwd();
  const profile = loadProfile();
  const translator = createEnvironmentTranslator();
  const { xFeed } = await fetchFeeds();
  const result = await buildDigestFromFeeds({ profile, xFeed, translator });
  const archivePath = path.join(rootDir, "data/digests/archive.json");
  const archive = upsertArchive(await readArchive(archivePath), result.archiveEntry);

  await writeOutputs({
    rootDir,
    latest: result.latest,
    archive,
    markdown: result.markdown
  });

  console.log(
    `Generated ${result.latest.date}: ${result.latest.tweetHighlights.length} text-first builder posts`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
