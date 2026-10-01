// Prompts a user can paste into a coding agent that has the product-map skill.
// They name the file and line, quote the problem, and say what a good fix looks like.

const VALIDATE_HINT = 'Then run the Product Map validation command from AGENTS.md or CLAUDE.md (for example `npm run product-map -- validate` or `python3 product/validate.py`) and confirm it passes.';

function where(map, file, line) {
  const dir = map.productRel || 'product';
  return `${dir}/${file}${line ? `, line ${line}` : ''}`;
}

export function markerPrompt(map, m) {
  const text = m.text.replace(/^[-*]\s+/, '');
  if (m.kind === 'disagree') {
    return `Using the product-map skill, investigate a UI/code disagreement recorded in the Product Map.

File: ${where(map, m.file, m.line)}
Note: ${text}

Confirm what users actually see versus what the code does, with evidence (screen, file, test). Tell me whether this is a bug in the product and what you would change. Do not change product behavior without my go-ahead. If I confirm a fix, update the affected flow in the same change and remove the marker; if the behavior is intended, rewrite the note as the real behavior. ${VALIDATE_HINT}`;
  }
  return `Using the product-map skill, resolve an open question in the Product Map.

File: ${where(map, m.file, m.line)}
Marker: ${text}

Find out what the product actually does here: exercise it in the running app if you can, then confirm in the code and tests. Replace the marker with the observed behavior, in user terms, and append "(from code, not exercised)" if you could only read the code. If the evidence is still insufficient, leave the marker and tell me exactly what would resolve it. Change only this flow; do not rewrite healthy content. ${VALIDATE_HINT}`;
}

export function issuePrompt(map, it) {
  return `Using the product-map skill, fix a validation problem in the Product Map.

File: ${where(map, it.path, it.line)}
Problem (${it.level}): ${it.message}

Fix it following the format contract in the skill's references/format.md. Change only what this problem requires and keep IDs stable unless the problem is the ID itself; update every reference if an ID or file name changes. ${VALIDATE_HINT}`;
}

export function allMarkersPrompt(map, markers) {
  const list = markers.map((m, i) => `${i + 1}. ${where(map, m.file, m.line)}\n   ${m.text.replace(/^[-*]\s+/, '')}`).join('\n');
  return `Using the product-map skill, work through the open questions in the Product Map, one at a time.

${list}

For each "Behavior unclear" marker: find out what the product actually does (running app first, then code and tests), replace the marker with the observed behavior in user terms, and append "(from code, not exercised)" if you could only read the code. Leave a marker in place when the evidence is still insufficient and tell me what would resolve it.
For each "UI and code disagree" note: confirm both sides with evidence and tell me whether it is a bug; do not change product behavior without my go-ahead.
Change only the affected flows. ${VALIDATE_HINT} Finish with a short list of what you resolved and what is still open.`;
}

export function allIssuesPrompt(map, items) {
  const list = items.map((it, i) => `${i + 1}. [${it.level}] ${where(map, it.path, it.line)}\n   ${it.message}`).join('\n');
  return `Using the product-map skill, fix these validation problems in the Product Map:

${list}

Follow the format contract in the skill's references/format.md. Change only what each problem requires, keep IDs stable unless an ID is the problem, and update every reference when an ID or file name changes. Fix all errors; fix warnings unless they are deliberate, and say so if you leave one. ${VALIDATE_HINT}`;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {}
    ta.remove();
    return ok;
  }
}
