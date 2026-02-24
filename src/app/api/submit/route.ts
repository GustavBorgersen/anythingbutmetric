import { NextRequest, NextResponse } from "next/server";

const GITHUB_OWNER = process.env.GITHUB_REPO_OWNER!;
const GITHUB_REPO  = process.env.GITHUB_REPO_NAME!;
const GITHUB_PAT   = process.env.GITHUB_PAT!;
const WORKFLOW_ID  = "submission-scraper.yml";

export async function POST(req: NextRequest) {
  let body: { url?: string; notRobot?: boolean; _trap?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { url, notRobot, _trap } = body;

  // Honeypot — real users never see/fill this field
  if (_trap) return NextResponse.json({ ok: true });

  if (!notRobot)
    return NextResponse.json({ error: "Please confirm you are not a robot." }, { status: 400 });

  if (!url?.trim())
    return NextResponse.json({ error: "URL is required." }, { status: 400 });

  let parsed: URL;
  try { parsed = new URL(url.trim()); }
  catch { return NextResponse.json({ error: "Invalid URL." }, { status: 400 }); }

  if (parsed.protocol !== "https:")
    return NextResponse.json({ error: "Only HTTPS URLs are accepted." }, { status: 400 });

  if (!GITHUB_OWNER || !GITHUB_REPO || !GITHUB_PAT) {
    console.error("Missing GitHub env vars");
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const dispatchUrl =
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${WORKFLOW_ID}/dispatches`;

  let ghRes: Response;
  try {
    ghRes = await fetch(dispatchUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITHUB_PAT}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main", inputs: { article_url: parsed.href } }),
    });
  } catch (err) {
    console.error("GitHub dispatch error:", err);
    return NextResponse.json({ error: "Could not reach GitHub. Try again." }, { status: 502 });
  }

  if (ghRes.status === 204) return NextResponse.json({ ok: true });

  console.error(`GitHub dispatch ${ghRes.status}:`, await ghRes.text().catch(() => ""));
  return NextResponse.json({ error: "Failed to queue submission. Try again." }, { status: 502 });
}
