const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateSlug(slug) {
  if (typeof slug !== 'string') return { ok: false, reason: 'slug must be a string' };
  if (slug.length === 0 || slug.length > 64) return { ok: false, reason: 'slug length must be 1-64' };
  if (!SLUG_RE.test(slug)) return { ok: false, reason: 'slug must be kebab-case [a-z0-9-], no leading/trailing dashes' };
  return { ok: true };
}

function isPrivateOrLoopbackHost(host) {
  if (!host) return true;
  const h = host.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === '::1' || h === '[::1]') return true;
  const naked = h.startsWith('[') && h.endsWith(']') ? h.slice(1, -1) : h;
  const v4 = naked.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [parseInt(v4[1], 10), parseInt(v4[2], 10)];
    if (a === 127) return true;
    if (a === 10) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  if (/^fc[0-9a-f]{2}:/i.test(naked) || /^fd[0-9a-f]{2}:/i.test(naked)) return true;
  return false;
}

export function validateRetailerUrl(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return { ok: false, reason: 'retailer_url is required' };
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: 'retailer_url must be a valid URL' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, reason: `unsupported scheme ${url.protocol}` };
  }
  if (isPrivateOrLoopbackHost(url.hostname)) {
    return { ok: false, reason: 'retailer_url cannot be a loopback or private address' };
  }
  return { ok: true };
}

export function validateOption(opt) {
  const errors = [];
  if (!opt || typeof opt !== 'object') return { ok: false, errors: ['option'] };

  if (typeof opt.name !== 'string' || opt.name.trim() === '' || opt.name.length > 120) {
    errors.push('name');
  }
  if (typeof opt.price_dkk !== 'number' || !Number.isFinite(opt.price_dkk) || opt.price_dkk < 0) {
    errors.push('price_dkk');
  }
  const urlCheck = validateRetailerUrl(opt.retailer_url);
  if (!urlCheck.ok) errors.push('retailer_url');

  if (typeof opt.excerpt !== 'string' || opt.excerpt.trim() === '' || opt.excerpt.length > 500) {
    errors.push('excerpt');
  }
  if (typeof opt.last_verified !== 'string' || !ISO_DATE_RE.test(opt.last_verified)) {
    errors.push('last_verified');
  } else {
    const today = new Date().toISOString().slice(0, 10);
    if (opt.last_verified > today) errors.push('last_verified');
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

export function validatePairwiseCompleteness(decision) {
  if (decision.method !== 'pairwise') return { ok: true };
  const options = decision.options ?? [];
  const criteria = decision.criteria ?? [];
  if (options.length > 6) return { ok: false, errors: ['pairwise: option count exceeds the cap of 6'] };
  const errors = [];
  const sorted = [...options].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const c of criteria) {
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const left = sorted[i];
        const right = sorted[j];
        const v = left.pairwise?.[c.name]?.[right.id];
        if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
          errors.push(`pairwise: missing/invalid comparison for criterion "${c.name}" — ${left.id} vs ${right.id}`);
        }
      }
    }
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
