const OWNER = process.env.GITHUB_OWNER;
const REPO = process.env.GITHUB_REPO;
const BRANCH = process.env.GITHUB_BRANCH || "main";
const TOKEN = process.env.GITHUB_TOKEN;
const API = "https://api.github.com";

function assertConfigured() {
  if (!OWNER || !REPO || !TOKEN) {
    throw new Error("Missing GITHUB_OWNER, GITHUB_REPO, or GITHUB_TOKEN environment variables in Netlify site settings.");
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

async function getJsonFile(path) {
  assertConfigured();
  const url = `${API}/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(path)}?ref=${BRANCH}`;
  const response = await fetch(url, { headers: headers() });
  if (response.status === 404) return { data: null, sha: null };
  if (!response.ok) throw new Error(`GitHub read failed (${response.status}): ${await response.text()}`);
  const body = await response.json();
  const content = Buffer.from(body.content, "base64").toString("utf-8");
  return { data: JSON.parse(content), sha: body.sha };
}

async function putJsonFile(path, dataObj, sha, message) {
  assertConfigured();
  const url = `${API}/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(path)}`;
  const body = {
    message: message || `update ${path}`,
    content: Buffer.from(JSON.stringify(dataObj, null, 2)).toString("base64"),
    branch: BRANCH
  };
  if (sha) body.sha = sha;

  const response = await fetch(url, { method: "PUT", headers: headers(), body: JSON.stringify(body) });
  if (response.status === 409 || response.status === 422) {
    const conflictError = new Error("conflict");
    conflictError.conflict = true;
    throw conflictError;
  }
  if (!response.ok) throw new Error(`GitHub write failed (${response.status}): ${await response.text()}`);
  const result = await response.json();
  return result.content.sha;
}

async function updateJsonFile(path, mutateFn, message, attempts = 5) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const { data, sha } = await getJsonFile(path);
    const next = await mutateFn(data);
    try {
      await putJsonFile(path, next, sha, message);
      return next;
    } catch (error) {
      if (error.conflict && attempt < attempts - 1) continue;
      throw error;
    }
  }
}

module.exports = { getJsonFile, updateJsonFile };
