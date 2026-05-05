const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateSlug(slug) {
  if (typeof slug !== 'string') return { ok: false, reason: 'slug must be a string' };
  if (slug.length === 0 || slug.length > 64) return { ok: false, reason: 'slug length must be 1-64' };
  if (!SLUG_RE.test(slug)) return { ok: false, reason: 'slug must be kebab-case [a-z0-9-], no leading/trailing dashes' };
  return { ok: true };
}

const MAX_URL_LEN = 2048;

function isBlockedHost(host) {
  if (!host) return true;
  const h = host.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === '::1' || h === '[::1]') return true;
  const naked = h.startsWith('[') && h.endsWith(']') ? h.slice(1, -1) : h;
  const v4 = naked.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [parseInt(v4[1], 10), parseInt(v4[2], 10)];
    if (a === 0) return true;                              // 0.0.0.0/8 (unspecified)
    if (a === 127) return true;                            // loopback
    if (a === 10) return true;                             // RFC1918 private
    if (a === 192 && b === 168) return true;               // RFC1918 private
    if (a === 172 && b >= 16 && b <= 31) return true;      // RFC1918 private
    if (a === 169 && b === 254) return true;               // link-local incl. cloud metadata 169.254.169.254
    if (a === 100 && b >= 64 && b <= 127) return true;     // CGNAT 100.64.0.0/10
    if (a >= 224) return true;                             // multicast 224.0.0.0/4 + reserved 240.0.0.0/4
  }
  if (naked === '::') return true;                         // IPv6 unspecified
  if (/^fc[0-9a-f]{2}:/i.test(naked)) return true;         // IPv6 ULA fc00::/8
  if (/^fd[0-9a-f]{2}:/i.test(naked)) return true;         // IPv6 ULA fd00::/8
  if (/^fe80:/i.test(naked)) return true;                  // IPv6 link-local
  if (/^ff[0-9a-f]{2}:/i.test(naked)) return true;         // IPv6 multicast
  return false;
}

export function validateRetailerUrl(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return { ok: false, reason: 'retailer_url is required' };
  }
  if (value.length > MAX_URL_LEN) {
    return { ok: false, reason: `retailer_url exceeds max length ${MAX_URL_LEN}` };
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: 'retailer_url must be a valid URL' };
  }
  if (url.protocol !== 'https:') {
    return { ok: false, reason: `retailer_url must use https (got ${url.protocol})` };
  }
  if (isBlockedHost(url.hostname)) {
    return { ok: false, reason: 'retailer_url host is loopback, private, link-local, multicast, or unspecified' };
  }
  return { ok: true };
}

const AGGREGATOR_ROOTS = ['pricerunner', 'prisjakt'];

function isAggregatorHost(host) {
  if (!host) return false;
  const h = host.toLowerCase().replace(/^www\./, '');
  const root = h.split('.')[0];
  return AGGREGATOR_ROOTS.includes(root);
}

export function validateBestPriceUrl(value) {
  if (value === undefined || value === null || value === '') {
    return { ok: true };
  }
  const base = validateRetailerUrl(value);
  if (!base.ok) return { ok: false, reason: base.reason.replace(/^retailer_url/, 'best_price_url') };
  const url = new URL(value);
  if (isAggregatorHost(url.hostname)) {
    return { ok: false, reason: 'best_price_url must point at a specific retailer, not a price aggregator (pricerunner, prisjakt)' };
  }
  return { ok: true };
}

export function validateApartmentM2(value) {
  if (value === undefined || value === null) return { ok: true };
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return { ok: false, reason: 'apartment_m2 must be a finite positive number' };
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

  const bestCheck = validateBestPriceUrl(opt.best_price_url);
  if (!bestCheck.ok) errors.push('best_price_url');

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

function isPositiveFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

export function validateBudget(decision) {
  const errors = [];
  const hasBudget = decision.budget_dkk !== undefined && decision.budget_dkk !== null;
  const hasCeiling = decision.stretch_ceiling_dkk !== undefined && decision.stretch_ceiling_dkk !== null;
  if (hasBudget && !isPositiveFiniteNumber(decision.budget_dkk)) {
    errors.push('budget_dkk must be a finite number >= 0');
  }
  if (hasCeiling && !isPositiveFiniteNumber(decision.stretch_ceiling_dkk)) {
    errors.push('stretch_ceiling_dkk must be a finite number >= 0');
  }
  if (
    hasBudget && hasCeiling &&
    isPositiveFiniteNumber(decision.budget_dkk) &&
    isPositiveFiniteNumber(decision.stretch_ceiling_dkk) &&
    decision.stretch_ceiling_dkk < decision.budget_dkk
  ) {
    errors.push('stretch_ceiling_dkk must be >= budget_dkk');
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
