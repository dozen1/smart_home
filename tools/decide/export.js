import { scoreWeighted, scorePugh, scorePairwise } from './scoring.js';

function rank(decision) {
  switch (decision.method) {
    case 'pugh': return scorePugh(decision);
    case 'pairwise': return scorePairwise(decision);
    case 'weighted':
    default: return scoreWeighted(decision);
  }
}

function maxLastVerified(options) {
  const dates = options.map((o) => o.last_verified).filter(Boolean);
  return dates.sort().at(-1) ?? '';
}

function fmtScore(score, method) {
  if (method === 'pairwise' || method === 'weighted') return score.toFixed(2);
  return String(score);
}

function escapeMdCell(str) {
  return String(str ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function escapeMdLinkText(str) {
  return String(str ?? '').replace(/\]/g, '\\]').replace(/\r?\n/g, ' ');
}

function escapeMdQuoted(str) {
  return String(str ?? '').replace(/"/g, '\\"').replace(/\r?\n/g, ' ');
}

function hostnameOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

export function renderMarkdown(decision) {
  const ranked = rank(decision);
  const winnerId = ranked[0]?.id;
  const phase = decision.phase == null ? '—' : String(decision.phase);
  const lines = [];
  lines.push(`# ${decision.title}`);
  lines.push('');
  lines.push(`Last verified: ${maxLastVerified(decision.options ?? [])}`);
  lines.push('');
  lines.push(`Phase: ${phase}  ·  Method: ${decision.method}`);
  lines.push('');

  const criteria = decision.criteria ?? [];
  const header = ['Option', 'Price (DKK)', ...criteria.map((c) => escapeMdCell(c.name)), 'Score', 'Verdict'];
  const sep = header.map(() => '---');
  lines.push('## Trade-off table');
  lines.push('');
  lines.push(`| ${header.join(' | ')} |`);
  lines.push(`| ${sep.join(' | ')} |`);
  for (const r of ranked) {
    const opt = decision.options.find((o) => o.id === r.id);
    if (!opt) continue;
    const safeName = escapeMdCell(opt.name);
    const cells = [
      r.id === winnerId ? `**${safeName}**` : safeName,
      String(opt.price_dkk),
      ...criteria.map((c) => {
        if (decision.method === 'pugh') return String(opt.pugh?.[c.name] ?? 0);
        return String(opt.scores?.[c.name] ?? '');
      }),
      fmtScore(r.score, decision.method),
      r.id === winnerId ? '✅ pick' : '',
    ];
    lines.push(`| ${cells.join(' | ')} |`);
  }
  lines.push('');

  lines.push('## Citations');
  lines.push('');
  for (const opt of decision.options) {
    lines.push(`- **${escapeMdLinkText(opt.name)}** — [${hostnameOf(opt.retailer_url)}](${opt.retailer_url}) — _"${escapeMdQuoted(opt.excerpt)}"_  (verified ${opt.last_verified})`);
  }
  lines.push('');

  lines.push('## Notes');
  lines.push('');
  lines.push(decision.notes && decision.notes.trim() ? decision.notes : '—');
  lines.push('');

  lines.push('## Decision');
  lines.push('');
  lines.push(decision.decision && decision.decision.trim() ? decision.decision : 'Pending');
  lines.push('');

  return lines.join('\n');
}
