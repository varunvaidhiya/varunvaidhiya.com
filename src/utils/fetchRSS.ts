export interface FeedItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  thumbnail?: string;
  videoId?: string;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

function extractTag(xml: string, tag: string): string {
  const cdataRe = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, "i");
  const cdataMatch = xml.match(cdataRe);
  if (cdataMatch) return cdataMatch[1].trim();

  const plainRe = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const plainMatch = xml.match(plainRe);
  return plainMatch ? plainMatch[1].trim() : "";
}

function extractAttr(xml: string, tag: string, attr: string): string {
  const re = new RegExp(`<${tag}[^>]*\\s${attr}="([^"]*)"`, "i");
  return xml.match(re)?.[1] ?? "";
}

function parseEntries(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  const entryRe = /<(?:item|entry)([\s\S]*?)>?([\s\S]*?)<\/(?:item|entry)>/g;

  for (let match = entryRe.exec(xml); match !== null; match = entryRe.exec(xml)) {
    const chunk = match[2];

    const title = extractTag(chunk, "title") || extractTag(chunk, "media:title");

    let link = extractTag(chunk, "link");
    if (!link || link.startsWith("<")) {
      link = extractAttr(chunk, "link", "href");
    }
    // RSS link may be just a URL text node without closing tag after whitespace
    if (!link) {
      const linkMatch = chunk.match(/<link>([^<]+)/i);
      if (linkMatch) link = linkMatch[1].trim();
    }

    const pubDate =
      extractTag(chunk, "pubDate") ||
      extractTag(chunk, "published") ||
      extractTag(chunk, "updated");

    const rawDesc =
      extractTag(chunk, "description") ||
      extractTag(chunk, "content") ||
      extractTag(chunk, "summary") ||
      extractTag(chunk, "media:description");
    const description = stripHtml(rawDesc).slice(0, 220);

    const thumbnail =
      extractAttr(chunk, "media:thumbnail", "url") || extractAttr(chunk, "media:content", "url");

    const videoId = extractTag(chunk, "yt:videoId");

    if (title && link) {
      items.push({ title, link, pubDate, description, thumbnail, videoId });
    }
  }

  return items.slice(0, 8);
}

export async function fetchRSSFeed(url: string): Promise<FeedItem[]> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; VarunVaidhiya.me feed reader/1.0)",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseEntries(xml);
  } catch {
    return [];
  }
}

export async function fetchYouTubeFeed(handle: string): Promise<FeedItem[]> {
  try {
    const res = await fetch(`https://www.youtube.com/${handle}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; VarunVaidhiya.me feed reader/1.0)",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const channelId = html.match(/"channelId":"([^"]+)"/)?.[1];
    if (!channelId) return [];
    return fetchRSSFeed(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
  } catch {
    return [];
  }
}

export async function fetchTwitterFeed(username: string): Promise<FeedItem[]> {
  const candidates = [
    `https://nitter.privacydev.net/${username}/rss`,
    `https://nitter.poast.org/${username}/rss`,
    `https://nitter.catsarch.com/${username}/rss`,
  ];

  for (const url of candidates) {
    const items = await fetchRSSFeed(url);
    if (items.length > 0) return items;
  }

  return [];
}

export function formatFeedDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}
