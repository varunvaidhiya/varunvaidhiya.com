import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRepoList, collectGitHubDocs } from "./github.mjs";

test("parseRepoList keeps well-formed owner/repo entries", () => {
  assert.deepEqual(parseRepoList("a/b, c/d , bad, e/f/g"), ["a/b", "c/d"]);
  assert.deepEqual(parseRepoList(""), []);
});

function githubRouter(overrides = {}) {
  const readmes = overrides.readmes ?? {
    "varunvaidhiya/AI-on-Arm": "# AI-on-Arm\n\nAI inference on ARM hardware and benchmarking.",
  };
  const meta = overrides.meta ?? {
    "varunvaidhiya/AI-on-Arm": {
      full_name: "varunvaidhiya/AI-on-Arm",
      name: "AI-on-Arm",
      description: "AI inference on ARM",
      language: "Python",
      topics: ["arm", "ai"],
      html_url: "https://github.com/varunvaidhiya/AI-on-Arm",
    },
  };
  return async (url) => {
    if (/\/users\/[^/]+\/repos/.test(url)) {
      return { ok: true, json: async () => overrides.list ?? [] };
    }
    const m = url.match(/\/repos\/([^/]+)\/([^/]+?)(\/readme)?$/);
    if (!m) throw new Error(`unexpected url ${url}`);
    const key = `${m[1]}/${m[2]}`;
    if (m[3] === "/readme") {
      const body = readmes[key];
      return body ? { ok: true, text: async () => body } : { ok: false, status: 404 };
    }
    const data = meta[key];
    return data ? { ok: true, json: async () => data } : { ok: false, status: 404 };
  };
}

test("builds a chunked doc from README + metadata for an explicit repo", async () => {
  const chunks = await collectGitHubDocs({
    repos: ["varunvaidhiya/AI-on-Arm"],
    fetchImpl: githubRouter(),
    logger: () => {},
  });
  assert.ok(chunks.length >= 1);
  const c = chunks[0];
  assert.ok(c.id.startsWith("github/varunvaidhiya/AI-on-Arm"));
  assert.equal(c.source, "github");
  assert.equal(c.url, "https://github.com/varunvaidhiya/AI-on-Arm");
  assert.ok(c.tags.includes("Python") && c.tags.includes("arm"));
  assert.ok(chunks.some((x) => /inference on ARM/i.test(x.text)));
});

test("resolves a user's public repos when no explicit list is given", async () => {
  const router = githubRouter({
    list: [
      { full_name: "varunvaidhiya/AI-on-Arm", private: false, archived: false },
      { full_name: "varunvaidhiya/secret", private: true, archived: false },
    ],
  });
  const chunks = await collectGitHubDocs({ user: "varunvaidhiya", fetchImpl: router, logger: () => {} });
  const ids = new Set(chunks.map((c) => c.id.split("#")[0]));
  assert.ok(ids.has("github/varunvaidhiya/AI-on-Arm"));
  assert.ok(!ids.has("github/varunvaidhiya/secret"), "private repos excluded");
});

test("uses description when README is missing (404)", async () => {
  const router = githubRouter({ readmes: {} }); // all READMEs 404
  const chunks = await collectGitHubDocs({
    repos: ["varunvaidhiya/AI-on-Arm"],
    fetchImpl: router,
    logger: () => {},
  });
  assert.ok(chunks.length >= 1, "still indexed from description alone");
  assert.ok(chunks.some((c) => /AI inference on ARM/i.test(c.text)));
});

test("degrades gracefully when the API errors", async () => {
  const chunks = await collectGitHubDocs({
    repos: ["varunvaidhiya/AI-on-Arm"],
    fetchImpl: async () => {
      throw new Error("network down");
    },
    logger: () => {},
  });
  assert.deepEqual(chunks, []);
});
