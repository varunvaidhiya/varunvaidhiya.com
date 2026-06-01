export interface GitHubEvent {
  type: string;
  repo: string;
  repoUrl: string;
  description: string;
  date: string;
  url: string;
  icon: string;
}

const EVENT_ICONS: Record<string, string> = {
  PushEvent: "⬆",
  CreateEvent: "✦",
  PullRequestEvent: "⇄",
  IssuesEvent: "○",
  WatchEvent: "★",
  ForkEvent: "⑂",
  ReleaseEvent: "◈",
  DeleteEvent: "✕",
};

function describeEvent(event: Record<string, unknown>): string | null {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const repoName = (event.repo as { name: string })?.name ?? "";
  const shortRepo = repoName.split("/")[1] ?? repoName;

  switch (event.type) {
    case "PushEvent": {
      const commits = payload.commits as Array<{ message: string }> | undefined;
      const count = (payload.size as number) || commits?.length || 1;
      const msg =
        commits?.[0]?.message?.split("\n")[0]?.slice(0, 72) ??
        `${count} commit${count !== 1 ? "s" : ""}`;
      return `Pushed to ${shortRepo}: ${msg}`;
    }
    case "CreateEvent":
      return `Created ${payload.ref_type ?? "repository"} in ${shortRepo}`;
    case "PullRequestEvent": {
      const pr = payload.pull_request as { title?: string } | undefined;
      const action = payload.action as string;
      if (action === "opened" || action === "closed") {
        return `${action === "opened" ? "Opened" : "Merged"} PR in ${shortRepo}: ${pr?.title?.slice(0, 72) ?? ""}`;
      }
      return null;
    }
    case "IssuesEvent": {
      const issue = payload.issue as { title?: string } | undefined;
      const action = payload.action as string;
      if (action === "opened") {
        return `Opened issue in ${shortRepo}: ${issue?.title?.slice(0, 72) ?? ""}`;
      }
      return null;
    }
    case "WatchEvent":
      return `Starred ${shortRepo}`;
    case "ForkEvent":
      return `Forked ${shortRepo}`;
    case "ReleaseEvent": {
      const rel = payload.release as { name?: string; tag_name?: string } | undefined;
      return `Released ${rel?.name ?? rel?.tag_name ?? ""} in ${shortRepo}`;
    }
    default:
      return null;
  }
}

function eventUrl(event: Record<string, unknown>): string {
  const repoName = (event.repo as { name: string })?.name ?? "";
  const payload = (event.payload ?? {}) as Record<string, unknown>;

  switch (event.type) {
    case "PushEvent": {
      const commits = payload.commits as Array<{ sha: string }> | undefined;
      const sha = commits?.[0]?.sha;
      return sha
        ? `https://github.com/${repoName}/commit/${sha}`
        : `https://github.com/${repoName}`;
    }
    case "PullRequestEvent": {
      const pr = payload.pull_request as { html_url?: string } | undefined;
      return pr?.html_url ?? `https://github.com/${repoName}`;
    }
    case "IssuesEvent": {
      const issue = payload.issue as { html_url?: string } | undefined;
      return issue?.html_url ?? `https://github.com/${repoName}`;
    }
    case "ReleaseEvent": {
      const rel = payload.release as { html_url?: string } | undefined;
      return rel?.html_url ?? `https://github.com/${repoName}`;
    }
    default:
      return `https://github.com/${repoName}`;
  }
}

export async function fetchGitHubActivity(username: string): Promise<GitHubEvent[]> {
  try {
    const res = await fetch(`https://api.github.com/users/${username}/events/public?per_page=50`, {
      headers: {
        "User-Agent": "VarunVaidhiya.me/1.0",
        Accept: "application/vnd.github+json",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];

    const raw = (await res.json()) as Array<Record<string, unknown>>;
    const events: GitHubEvent[] = [];

    for (const event of raw) {
      const description = describeEvent(event);
      if (!description) continue;

      const repoName = (event.repo as { name: string })?.name ?? "";
      events.push({
        type: event.type as string,
        repo: repoName,
        repoUrl: `https://github.com/${repoName}`,
        description,
        date: event.created_at as string,
        url: eventUrl(event),
        icon: EVENT_ICONS[event.type as string] ?? "·",
      });

      if (events.length >= 12) break;
    }

    return events;
  } catch {
    return [];
  }
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
