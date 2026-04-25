// Vercel Serverless Function — saves HTML content to GitHub repo
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { repo, file, content } = req.body;

  if (!repo || !file || !content) {
    return res.status(400).json({ error: 'Missing repo, file or content' });
  }

  // Validate repo is whitelisted (security: only allow known repos)
  const ALLOWED_REPOS = (process.env.ALLOWED_REPOS || '').split(',').map(r => r.trim());
  if (ALLOWED_REPOS.length > 0 && ALLOWED_REPOS[0] !== '' && !ALLOWED_REPOS.includes(repo)) {
    return res.status(403).json({ error: 'Repo not allowed' });
  }

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  if (!GITHUB_TOKEN) return res.status(500).json({ error: 'Server misconfigured' });

  const API = `https://api.github.com/repos/${repo}/contents/${file}`;

  try {
    // Get current SHA
    const getRes = await fetch(API, {
      headers: { Authorization: `token ${GITHUB_TOKEN}` }
    });
    const getData = await getRes.json();
    if (!getData.sha) throw new Error('Could not get file SHA: ' + JSON.stringify(getData));

    // Encode content
    const encoded = Buffer.from(content, 'utf-8').toString('base64');

    // Commit
    const putRes = await fetch(API, {
      method: 'PUT',
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'cms: content update via EWD Editor',
        content: encoded,
        sha: getData.sha,
      }),
    });
    const putData = await putRes.json();

    if (putData.content) {
      return res.status(200).json({ ok: true, sha: putData.content.sha.slice(0, 8) });
    }
    throw new Error(putData.message || JSON.stringify(putData));

  } catch (e) {
    console.error('save error:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
