import type { RepoAnnouncement } from "../types/nostr";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function generateRepoRSS(
  repo: RepoAnnouncement,
  items: Array<{ title: string; link: string; description: string; pubDate: Date }>
): string {
  const channelTitle = escapeXml(repo.name);
  const channelDescription = escapeXml(repo.description || `Repository ${repo.name}`);
  const channelLink = repo.webUrls.length > 0
    ? escapeXml(repo.webUrls[0])
    : escapeXml(`${window.location.origin}/repo/${repo.pubkey}/${repo.identifier}`);

  const itemsXml = items
    .map(
      (item) => `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.link)}</link>
      <description>${escapeXml(item.description)}</description>
      <pubDate>${item.pubDate.toUTCString()}</pubDate>
    </item>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${channelTitle}</title>
    <link>${channelLink}</link>
    <description>${channelDescription}</description>
    <language>en</language>
    <generator>NostrLab</generator>
${itemsXml}
  </channel>
</rss>`;
}
