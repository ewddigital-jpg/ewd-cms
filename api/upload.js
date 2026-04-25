// Vercel Serverless Function — uploads an image file to GitHub repo
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { repo, filename, content } = req.body;
  if (!repo || !filename || !content) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const API = `https://api.github.com/repos/${repo}/contents/${filename}`;

  try {
    // Check if file exists
    const getRes = await fetch(API, {
      headers: { Authorization: `token ${GITHUB_TOKEN}` }
    });
    const getData = await getRes.json();
    const sha = getData.sha;

    const body = {
      message: 'cms: image upload via EWD Editor',
      content: content,
    };
    if (sha) body.sha = sha;

    const putRes = await fetch(API, {
      method: 'PUT',
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const putData = await putRes.json();
    if (putData.content) {
      return res.status(200).json({ ok: true, url: filename });
    }
    throw new Error(putData.message || JSON.stringify(putData));
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
