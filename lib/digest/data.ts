import fs from "node:fs/promises";
import path from "node:path";

import type { ArchiveEntry, LatestDigest } from "./types";

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export async function loadDigestData(rootDir: string): Promise<{
  latest: LatestDigest | null;
  archive: ArchiveEntry[];
}> {
  const latestPath = path.join(rootDir, "data/digests/latest.json");
  const archivePath = path.join(rootDir, "data/digests/archive.json");

  const [latest, archive] = await Promise.all([
    readJsonFile<LatestDigest>(latestPath),
    readJsonFile<ArchiveEntry[]>(archivePath)
  ]);

  return {
    latest:
      latest && latest.date && latest.generatedAt
        ? latest
        : null,
    archive: archive ?? []
  };
}
