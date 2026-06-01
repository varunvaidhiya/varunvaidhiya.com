export interface HFModel {
  id: string;
  name: string;
  url: string;
  likes: number;
  downloads: number;
  lastModified: string;
  task: string;
  tags: string[];
  isSpace: boolean;
}

export interface HFProfile {
  avatarUrl: string;
  fullname: string;
  numModels: number;
  numLikes: number;
}

const BASE = "https://huggingface.co";

export async function fetchHFModels(username: string): Promise<HFModel[]> {
  try {
    const [modelsRes, spacesRes] = await Promise.all([
      fetch(`${BASE}/api/models?author=${username}&sort=lastModified&limit=8`, {
        headers: { "User-Agent": "VarunVaidhiya.me/1.0" },
        signal: AbortSignal.timeout(8000),
      }),
      fetch(`${BASE}/api/spaces?author=${username}&sort=lastModified&limit=4`, {
        headers: { "User-Agent": "VarunVaidhiya.me/1.0" },
        signal: AbortSignal.timeout(8000),
      }),
    ]);

    const models: HFModel[] = [];

    if (modelsRes.ok) {
      const raw = (await modelsRes.json()) as Array<Record<string, unknown>>;
      for (const m of raw) {
        if (m.private) continue;
        const id = m.id as string;
        models.push({
          id,
          name: id.split("/")[1] ?? id,
          url: `${BASE}/${id}`,
          likes: (m.likes as number) ?? 0,
          downloads: (m.downloads as number) ?? 0,
          lastModified: (m.lastModified as string) ?? "",
          task: (m.pipeline_tag as string) ?? "",
          tags: ((m.tags as string[]) ?? []).slice(0, 3),
          isSpace: false,
        });
      }
    }

    if (spacesRes.ok) {
      const raw = (await spacesRes.json()) as Array<Record<string, unknown>>;
      for (const s of raw) {
        if (s.private) continue;
        const id = s.id as string;
        models.push({
          id,
          name: id.split("/")[1] ?? id,
          url: `${BASE}/spaces/${id}`,
          likes: (s.likes as number) ?? 0,
          downloads: 0,
          lastModified: (s.lastModified as string) ?? "",
          task: "space",
          tags: ((s.tags as string[]) ?? []).slice(0, 3),
          isSpace: true,
        });
      }
    }

    // Sort by lastModified desc
    return models
      .sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())
      .slice(0, 8);
  } catch {
    return [];
  }
}

export async function fetchHFProfile(username: string): Promise<HFProfile | null> {
  try {
    const res = await fetch(`${BASE}/api/users/${username}`, {
      headers: { "User-Agent": "VarunVaidhiya.me/1.0" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    return {
      avatarUrl: (data.avatarUrl as string) ?? "",
      fullname: (data.fullname as string) ?? username,
      numModels: (data.numModels as number) ?? 0,
      numLikes: (data.numLikes as number) ?? 0,
    };
  } catch {
    return null;
  }
}

export function formatTaskLabel(task: string): string {
  if (!task) return "";
  return task
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
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
