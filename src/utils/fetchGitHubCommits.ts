export interface GitHubCommit {
  sha: string;
  message: string;
  repo: string;
  repoUrl: string;
  url: string;
  date: string;
}

export async function fetchRecentCommits(username: string): Promise<GitHubCommit[]> {
  // Calculate the date 30 days ago
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const dateStr = thirtyDaysAgo.toISOString().split("T")[0]; // YYYY-MM-DD

  // Fallback if no token is available: we can still try unauthenticated, but it will only find public commits and might be rate-limited.
  // We recommend the user to set GITHUB_TOKEN.
  const token = import.meta.env.GITHUB_TOKEN;
  
  const headers: HeadersInit = {
    "User-Agent": "VarunVaidhiya.me/1.0",
    Accept: "application/vnd.github+json",
  };
  
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const query = encodeURIComponent(`author:${username} committer-date:>${dateStr}`);
  const url = `https://api.github.com/search/commits?q=${query}&sort=committer-date&order=desc&per_page=30`;

  try {
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(8000),
    });
    
    if (!res.ok) {
      console.error("Failed to fetch commits:", res.status, res.statusText);
      return [];
    }

    const data = await res.json();
    const items = data.items || [];
    
    return items.map((item: any) => ({
      sha: item.sha,
      message: item.commit.message.split('\n')[0], // Get just the title/first line
      repo: item.repository.full_name,
      repoUrl: item.repository.html_url,
      url: item.html_url,
      date: item.commit.author.date,
    }));
  } catch (error) {
    console.error("Error fetching commits:", error);
    return [];
  }
}
