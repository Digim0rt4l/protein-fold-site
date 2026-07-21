// _github.js -- shared GitHub Contents API helper used by every function.
// Requires these Netlify environment variables to be set:
//   GITHUB_TOKEN   - a fine-grained personal access token with
//                    "Contents: Read and write" on the one repo
//   GITHUB_OWNER   - your GitHub username or org
//   GITHUB_REPO    - the repo name (same repo this site deploys from, or a
//                    separate data repo -- your choice)
//   GITHUB_BRANCH  - optional, defaults to "main"

const OWNER = process.env.GITHUB_OWNER;
const REPO = process.env.GITHUB_REPO;
const BRANCH = process.env.GITHUB_BRANCH || "main";
const TOKEN = process.env.GITHUB_TOKEN;
const API = "https://api.github.com";

function assertConfigured() {
  if (!OWNER || !REPO || !TOKEN) {
    throw new Error(
      "Missing GITHUB_OWNER / GITHUB_REPO / GITHUB_TOKEN environment variables in Netlify site settings."
    );
  }
}

function headers() {
  return {
    Authorization: `Bearer ${TOKEN}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "User-Agent": "protein-fold-webapp"
  };
}

// Reads a JSON file from the repo. Returns { data, sha } or { data: null, sha: null } if it doesn't exist yet.
async function getJsonFile(path) {
  assertConfigured();
  const url = `${API}/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(path)}?ref=${BRANCH}`;
  const res = await fetch(url, { headers: headers() });
  if (res.status === 404) return { data: null, sha: null };
  if (!res.ok) throw new Error(`GitHub read failed (${res.status}): ${await res.text()}`);
  const body = await res.json();
  const content = Buffer.from(body.content, "base64").toString("utf-8");
  return { data: JSON.parse(content), sha: body.sha };
}

// Writes a JSON file. Pass the previous sha (or null for a brand-new file).
// Retries a few times on 409 conflicts (two clients saving at once).
async function putJsonFile(path, dataObj, sha, message) {
  assertConfigured();
  const url = `${API}/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(path)}`;
  const body = {
    message: message || `update ${path}`,
    content: Buffer.from(JSON.stringify(dataObj, null, 2)).toString("base64"),
    branch: BRANCH
  };
  if (sha) body.sha = sha;

  const res = await fetch(url, { method: "PUT", headers: headers(), body: JSON.stringify(body) });
  if (res.status === 409 || res.status === 422) {
    const err = new Error("conflict");
    err.conflict = true;
    throw err;
  }
  if (!res.ok) throw new Error(`GitHub write failed (${res.status}): ${await res.text()}`);
  const result = await res.json();
  return result.content.sha;
}

// Read-modify-write with automatic retry on conflicts.
async function updateJsonFile(path, mutateFn, message, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    const { data, sha } = await getJsonFile(path);
    const next = await mutateFn(data);
    try {
      await putJsonFile(path, next, sha, message);
      return next;
    } catch (e) {
      if (e.conflict && i < attempts - 1) continue;
      throw e;
    }
  }
}

module.exports = { getJsonFile, putJsonFile, updateJsonFile };
