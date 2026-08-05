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

// Brief-driven prompt for venue and event stops. These are specific spots
// INSIDE the operator's own site (a walled garden, a long gallery, a memorial),
// so there is no reliable public research and the whole point is to write from
// what the operator knows first-hand. The operator's brief is the ONLY source:
// the model may set the scene and add warmth but must never introduce a fact,
// date, name or number that is not in the brief.
export function buildBriefNarrationPrompt(
  name: string,
  area: string,
  guideName: string,
  brief: string
): string {
  return `You are ${guideName}, the walking-tour guide for StorieD. Write a tour stop for "${name}"${area ? ` at ${area}` : ''}.

This stop is a specific spot inside a venue or event. The operator knows it first-hand and has written the brief below. It is your SINGLE SOURCE OF TRUTH.
"""
${brief}
"""
RULES ON SOURCES (no exceptions):
- Write only from the brief. Do NOT add dates, names, numbers, materials or history that are not stated in it.
- If the brief is short, keep the narration short and proportionate. Never pad with invented background.
- You may rephrase, set the scene, and add warmth and rhythm, but never introduce a new fact.

STORIED BRAND VOICE (five pillars):
1. Knowledgeable, not academic. Use the facts from the brief in service of the story, never lecturing.
2. Reveals the unexpected. Lead with the most surprising thing in the brief.
3. Present and second person. The visitor is always "you", here, now, looking and noticing.
4. Warm without sentiment. Warmth comes from specific detail, not hollow enthusiasm.
5. Precise prose, not lists. Full sentences with rhythm: a long layered sentence, then a short one.

HARD RULES (no exceptions):
- Never use em dashes ("—"). Use a comma, colon, full stop or parentheses.
- Do not use hyphens as dashes.
- Banned words: ${BANNED.join(', ')}.
- No exclamation marks. The tone is assured and calm.
- The visitor is standing AT this spot and may be indoors. Describe what is in front of them here. Do not tell them to step outside or look at a street.
- Do not open with the place name as the first word. Open with what the visitor sees or the hook from the brief.
- British English.

NARRATION STRUCTURE (200 to 450 words, adapt to how much the brief gives you; if it is thin, stay at the short end):
1. Opening hook (1-2 sentences): what the visitor sees at this spot.
2. What it is and why it matters, built entirely from the brief.
3. A detail to notice, drawn from the brief.
4. Closing (1-2 sentences): a lingering thought. Do NOT mention the app, any buttons, Log Visit, or the next stop. A standard closing is added automatically.

SHORT DESCRIPTION: one or two factual sentences drawn from the brief, 140 characters or fewer, no banned words, no em dashes, no exclamation marks.

FACTS: return 0 to 3 facts, and ONLY ones genuinely supported by the brief. If the brief does not contain enough to make a real fact, return fewer, even an empty array. Never invent a fact to fill the list.

Return ONLY valid JSON, no markdown, in exactly this shape:
{"shortDescription":"...","narration":"...","facts":["..."]}`;
}

// Calls Anthropic and parses the JSON draft. Returns null on any failure.
// When opts.fromBrief is set (venue/event stops), the draft is written purely
// from opts.brief with no external research; an empty brief returns a clear
// placeholder telling the operator to add a few notes, rather than inventing.
export async function generateNarration(
  apiKey: string,
  name: string,
  area: string,
  guideName: string,
  opts?: { fromBrief?: boolean; brief?: string }
): Promise<NarrationDraft | null> {
  const fromBrief = opts?.fromBrief === true;
  const brief = (opts?.brief ?? '').trim();

  // Venue/event stop with no notes yet: don't research, don't invent. Hand back
  // a stub that prompts the operator to add detail, then draft again.
  if (fromBrief && !brief) {
    return {
      shortDescription: '',
      narration: `Add a few notes about ${name} and ${guideName} will write this stop for you. Jot down what visitors should notice here, one or two facts, and any story worth telling, then draft this stop again.`,
      facts: [],
    };
  }

  try {
    const research = fromBrief ? '' : await fetchResearch(name, area);
    const content = fromBrief
      ? buildBriefNarrationPrompt(name, area, guideName, brief)
      : buildNarrationPrompt(name, area, guideName, research);
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
        messages: [{ role: 'user', content }],
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
