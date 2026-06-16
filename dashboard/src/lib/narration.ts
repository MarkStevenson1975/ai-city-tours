// Shared rich narration generator for StorieD.
//
// Mirrors the quality of the standalone tourcreator skill: it pulls real
// research (Wikipedia) for accurate, specific history, then writes a 3-5 minute
// spoken tour-stop script in the Storied brand voice, with a short description
// and three surprising facts. Used by both the autofill (build/lookup) and the
// "Generate narration with AI" button (build/draft).

// Model for drafting. One-off per stop and the audio is cached, so we use the
// stronger Sonnet model for richer writing. Override with STORIED_DRAFT_MODEL.
export const DRAFT_MODEL = process.env.STORIED_DRAFT_MODEL || 'claude-sonnet-4-6';

// Hollow superlatives and AI tics banned from all StorieD narration.
export const BANNED = [
  'amazing', 'incredible', 'stunning', 'breathtaking', 'iconic', 'unique',
  'unmissable', 'magical', 'enchanting', 'unforgettable', 'world-class',
  'hidden gem', 'nestled', 'bustling', 'rich history', 'boasts',
  'stands as a testament', 'in the heart of', 'whether you', 'no visit is complete',
];

export type NarrationDraft = {
  shortDescription: string;
  narration: string;
  facts: string[];
};

// Standard spoken closing appended to the end of every stop, in Harriet's
// voice. Tells the visitor to log the stop (Log Visit, top right) and then go
// back to choose the next one (Tour, top left). Kept identical across all
// stops so the instructions are always correct. No em dashes (brand rule).
export const STOP_CLOSING =
  'Take some time to look around and explore this stop. When you are ready, tap Log Visit in the top right corner of your screen to save your visit, then tap Tour in the top left corner to go back to your stop list and choose your next stop.';

// Best-effort: fetch a plain-text Wikipedia extract for the place to give the
// model accurate, specific historical material. Returns '' on any problem.
export async function fetchResearch(name: string, area: string): Promise<string> {
  try {
    const q = area ? `${name} ${area}` : name;
    const searchUrl =
      'https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=1&srsearch=' +
      encodeURIComponent(q);
    const sres = await fetch(searchUrl, { headers: { 'User-Agent': 'StorieD/1.0' } });
    if (!sres.ok) return '';
    const sjson = await sres.json();
    const title: string | undefined = sjson?.query?.search?.[0]?.title;
    if (!title) return '';

    const extractUrl =
      'https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1' +
      '&exsectionformat=plain&format=json&redirects=1&titles=' +
      encodeURIComponent(title);
    const eres = await fetch(extractUrl, { headers: { 'User-Agent': 'StorieD/1.0' } });
    if (!eres.ok) return '';
    const ejson = await eres.json();
    const pages = ejson?.query?.pages ?? {};
    const first = Object.values(pages)[0] as { extract?: string } | undefined;
    const extract = (first?.extract ?? '').trim();
    if (!extract) return '';
    // Bound the token cost: keep the most relevant opening of the article.
    return `Wikipedia article "${title}":\n${extract.slice(0, 3500)}`;
  } catch {
    return '';
  }
}

export function buildNarrationPrompt(
  name: string,
  area: string,
  guideName: string,
  research: string
): string {
  const researchBlock = research
    ? `\nResearch material (use only what is accurate and clearly about this place; ignore anything that does not match it, and never invent specifics):\n"""\n${research}\n"""\n`
    : `\nNo research material was found. Use only general, safe statements and do not invent specific dates, names, or numbers you are unsure of.\n`;

  return `You are ${guideName}, the walking-tour guide for StorieD. Write a tour stop for "${name}"${area ? ` in ${area}` : ''}.
${researchBlock}
STORIED BRAND VOICE (five pillars):
1. Knowledgeable, not academic. Use real dates, names, measurements and facts in service of the story, never lecturing.
2. Reveals the unexpected. Deliver something the visitor would never have spotted or known on their own.
3. Present and second person. The visitor is always "you", in the moment, looking and noticing. Write as a knowledgeable friend standing beside them.
4. Warm without sentiment. Warmth comes from specific human detail, not hollow enthusiasm.
5. Precise prose, not lists. Full sentences with rhythm: follow a long layered sentence with a short one.

HARD RULES (no exceptions):
- Never use em dashes ("—"). Use a comma, colon, full stop or parentheses.
- Do not use hyphens as dashes.
- Banned words: ${BANNED.join(', ')}.
- No exclamation marks. The tone is assured and calm, never a theme-park announcer.
- Do not open with the place name as the first word. Open with what the visitor sees or a hook from its history.
- The visitor is standing OUTSIDE. Describe what they can see from the street or entrance. Do not place them inside until you invite them in.
- British English.

NARRATION STRUCTURE (450 to 700 words, flowing spoken prose, adapt freely):
1. Opening hook (2-3 sentences): set the scene from outside, the first impression.
2. Origins and history (150-200 words): how the place came to be, who built it and why.
3. Stories and significance (150-200 words): what happened here, who came, why it is worth stopping.
4. Details to notice from outside (50-100 words): draw the eye to a specific exterior detail they might miss.
5. The invitation inside (2-4 sentences, only if it has a worthwhile interior): warmly encourage them in and name one specific thing to look for. If there is no interior, use a short closing reflection instead.
6. Closing (1-2 sentences): end with a lingering thought about this place. Do NOT mention the app, any buttons, Log Visit, or moving to the next stop. A standard closing with those instructions is added automatically, so end purely on the story.

SHORT DESCRIPTION: one or two short factual sentences, a vivid teaser, 140 characters or fewer, no banned words, no em dashes, no exclamation marks.

THREE FACTS: each genuinely surprising and specific (a real number, date, name or measurement), 1-2 sentences, readable in under 15 seconds, no em dashes or banned words.

Return ONLY valid JSON, no markdown, in exactly this shape:
{"shortDescription":"...","narration":"...","facts":["...","...","..."]}`;
}

// Calls Anthropic and parses the JSON draft. Returns null on any failure.
export async function generateNarration(
  apiKey: string,
  name: string,
  area: string,
  guideName: string
): Promise<NarrationDraft | null> {
  try {
    const research = await fetchResearch(name, area);
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: DRAFT_MODEL,
        max_tokens: 2500,
        messages: [{ role: 'user', content: buildNarrationPrompt(name, area, guideName, research) }],
      }),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      console.error('narration AI failure:', r.status, detail.slice(0, 300));
      return null;
    }
    const j = await r.json();
    const text: string = j?.content?.[0]?.text ?? '';
    const s = text.indexOf('{');
    const e = text.lastIndexOf('}');
    if (s === -1 || e === -1) return null;
    const parsed = JSON.parse(text.slice(s, e + 1));
    const body = String(parsed.narration ?? '').trim();
    return {
      shortDescription: String(parsed.shortDescription ?? '').trim(),
      // Always end every stop with the same correct Log Visit + next-stop close.
      narration: body ? `${body}\n\n${STOP_CLOSING}` : body,
      facts: Array.isArray(parsed.facts)
        ? parsed.facts.slice(0, 3).map((f: unknown) => String(f).trim())
        : [],
    };
  } catch (e) {
    console.error('narration error:', e);
    return null;
  }
}
