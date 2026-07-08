// GitHub connector (Milestone 3).
//
// Opt-in ingestion of public repositories' READMEs + metadata (description,
// language, topics) into the Chunk contract. Enabled at build time via env
// (DIGITAL_MIND_GITHUB_REPOS or DIGITAL_MIND_GITHUB_USER); public repos need no
// token, an optional GITHUB_TOKEN just raises rate limits. Every network call is
// wrapped so a rate-limit or outage degrades gracefully to whatever was fetched
// rather than failing the build. `fetchImpl` is injectable for tests.

import { chunkDocument } from "./chunk.mjs";

const API = "https://api.github.com";

/** Parse "owner/repo, owner/repo2" into a clean list. */
export function parseRepoList(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[^/]+\/[^/]+$/.test(s));
}

/**
 * @param {{ repos?: string[], user?: string, token?: string, maxRepos?: number, fetchImpl?: typeof fetch, logger?: (msg: string) => void }} opts
 * @returns {Promise<import("./chunk.mjs").Chunk[]>}
 */
export async function collectGitHubDocs(opts = {}) {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const maxRepos = opts.maxRepos ?? 50;
  const log = opts.logger ?? ((m) => console.warn(`[digital-mind] ${m}`));

  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "digital-mind-ingest",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
  };
  const get = (url, accept) =>
    fetchImpl(url, { headers: accept ? { ...headers, Accept: accept } : headers });

  // Resolve the repo list: explicit list wins, else list a user's public repos.
  let repoList = Array.isArray(opts.repos) ? [...opts.repos] : [];
  if (repoList.length === 0 && opts.user) {
    try {
      const res = await get(`${API}/users/${opts.user}/repos?per_page=100&sort=updated&type=owner`);
      if (res.ok) {
        const arr = await res.json();
        repoList = (Array.isArray(arr) ? arr : [])
          .filter((r) => r && !r.private && !r.archived)
          .map((r) => r.full_name);
      } else {
        log(`github: could not list repos for ${opts.user} (${res.status})`);
      }
    } catch (err) {
      log(`github: repo listing failed: ${err.message ?? err}`);
    }
  }
  repoList = repoList.slice(0, maxRepos);

  /** @type {import("./chunk.mjs").Chunk[]} */
  const chunks = [];
  for (const full of repoList) {
    const [owner, repo] = full.split("/");
    if (!owner || !repo) continue;
    try {
      let meta = {};
      const metaRes = await get(`${API}/repos/${owner}/${repo}`);
      if (metaRes.ok) meta = await metaRes.json();
      else log(`github: metadata ${full} (${metaRes.status})`);

      let readme = "";
      const rdRes = await get(`${API}/repos/${owner}/${repo}/readme`, "application/vnd.github.raw");
      if (rdRes.ok) readme = await rdRes.text();
      else if (rdRes.status !== 404) log(`github: readme ${full} (${rdRes.status})`);

      const description = meta.description || "";
      if (!readme && !description) {
        log(`github: ${full} has no README or description; skipping`);
        continue;
      }

      const tags = [meta.language, ...(Array.isArray(meta.topics) ? meta.topics : [])]
        .filter(Boolean)
        .map(String);
      const body = [`# ${meta.name || repo}`, description, readme].filter(Boolean).join("\n\n");

      chunks.push(
        ...chunkDocument({
          id: `github/${owner}/${repo}`,
          title: meta.full_name || full,
          url: meta.html_url || `https://github.com/${owner}/${repo}`,
          source: "github",
          tags,
          visibility: "public",
          body,
        }),
      );
    } catch (err) {
      log(`github: failed ${full}: ${err.message ?? err}`);
    }
  }

  return chunks;
}
