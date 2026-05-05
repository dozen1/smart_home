import { scoreWeighted, scorePugh, scorePairwise } from '/scoring.js';

const $ = (sel) => document.querySelector(sel);

const state = {
  slug: null,
  decision: null,
};

function emptyDecision() {
  return {
    slug: '', title: '', phase: null, method: 'weighted', baseline_option: null,
    criteria: [], options: [], notes: '', decision: null,
  };
}

function newOption() {
  return {
    id: `opt-${Math.random().toString(36).slice(2, 8)}`,
    name: '', price_dkk: null, retailer_url: '', best_price_url: '', excerpt: '', last_verified: '',
    scores: {}, pugh: {}, pairwise: {},
  };
}

async function loadList() {
  const r = await fetch('/api/decisions');
  const { decisions } = await r.json();
  const ul = $('#decision-list');
  ul.innerHTML = '';
  for (const d of decisions) {
    const li = document.createElement('li');
    li.textContent = d.title || d.slug;
    li.dataset.slug = d.slug;
    if (d.slug === state.slug) li.classList.add('active');
    li.addEventListener('click', () => loadDecision(d.slug));
    ul.appendChild(li);
  }
}

async function loadDecision(slug) {
  const r = await fetch(`/api/decisions/${encodeURIComponent(slug)}`);
  if (!r.ok) return setStatus('Failed to load.', 'error');
  state.slug = slug;
  state.decision = await r.json();
  renderEditor();
  loadList();
}

function newDecision() {
  state.slug = null;
  state.decision = emptyDecision();
  renderEditor();
}

function slugify(title) {
  return title.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

async function save() {
  if (!state.decision) return;
  const title = $('#title').value.trim();
  if (!title) return setStatus('Title required.', 'error');
  const slug = state.slug ?? slugify(title);
  if (!slug) return setStatus('Could not derive a slug from the title.', 'error');
  state.decision.title = title;
  state.decision.slug = slug;
  state.decision.phase = $('#phase').value ? parseInt($('#phase').value, 10) : null;
  state.decision.budget_dkk = $('#budget').value ? +$('#budget').value : null;
  state.decision.stretch_ceiling_dkk = $('#stretch-ceiling').value ? +$('#stretch-ceiling').value : null;
  state.decision.apartment_m2 = $('#apartment-m2').value ? +$('#apartment-m2').value : null;
  state.decision.notes = $('#notes').value;
  state.decision.decision = $('#decision-text').value || null;
  const r = await fetch(`/api/decisions/${encodeURIComponent(slug)}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(state.decision),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    return setStatus(`Save failed: ${err.error ?? r.status}`, 'error');
  }
  state.slug = slug;
  setStatus('Saved.', 'ok');
  await loadList();
}

async function exportMarkdown() {
  if (!state.slug) return setStatus('Save first.', 'error');
  const r = await fetch(`/api/decisions/${encodeURIComponent(state.slug)}/export`, { method: 'POST' });
  const body = await r.json().catch(() => ({}));
  if (r.status === 422) {
    const lines = (body.details ?? []).map((d) => `${d.option}: ${d.errors.join(', ')}`);
    return setStatus(`Cannot export — ${lines.join(' | ')}`, 'error');
  }
  if (!r.ok) return setStatus(`Export failed: ${body.error ?? r.status}`, 'error');
  setStatus(`Exported to ${body.markdown_path}`, 'ok');
}

function setStatus(msg, kind = '') {
  const el = $('#status');
  el.textContent = msg;
  el.className = kind;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function priceText(o) {
  if (o == null || o.price_dkk == null || o.price_dkk === '') return '';
  return ` (${Number(o.price_dkk).toLocaleString('da-DK')} DKK)`;
}

function priceHtml(o) {
  const t = priceText(o);
  return t ? ` <span class="price">${escapeHtml(t.trim())}</span>` : '';
}

function bestPriceHtml(o) {
  if (!o || !o.best_price_url) return '';
  let host;
  try { host = new URL(o.best_price_url).hostname.replace(/^www\./, ''); }
  catch { return ''; }
  return ` <a class="best-price" href="${escapeHtml(o.best_price_url)}" target="_blank" rel="noopener">buy at ${escapeHtml(host)}</a>`;
}

function renderCriteria() {
  const tbody = $('#criteria-table tbody');
  tbody.innerHTML = '';
  state.decision.criteria.forEach((c, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input data-i="${i}" data-k="name" value="${escapeHtml(c.name)}" /></td>
      <td><input data-i="${i}" data-k="weight" type="number" min="1" max="5" value="${c.weight ?? 1}" /></td>
      <td><button data-i="${i}" data-action="remove-criterion">×</button></td>
    `;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('input').forEach((el) => {
    el.addEventListener('input', () => {
      const i = +el.dataset.i; const k = el.dataset.k;
      const v = el.type === 'checkbox' ? el.checked : (el.type === 'number' ? +el.value : el.value);
      state.decision.criteria[i][k] = v;
      renderScorePanel();
    });
  });
  tbody.querySelectorAll('button[data-action="remove-criterion"]').forEach((b) => {
    b.addEventListener('click', () => { state.decision.criteria.splice(+b.dataset.i, 1); renderEditor(); });
  });
}

function renderOptions() {
  const list = $('#options-list');
  list.innerHTML = '';
  state.decision.options.forEach((o, i) => {
    const card = document.createElement('div');
    card.className = 'option-card';
    card.innerHTML = `
      <div class="row">
        <label>Name<input data-i="${i}" data-k="name" value="${escapeHtml(o.name)}" /></label>
        <label>Price (DKK)<input data-i="${i}" data-k="price_dkk" type="number" min="0" value="${o.price_dkk ?? ''}" /></label>
        <label>Retailer URL<input data-i="${i}" data-k="retailer_url" value="${escapeHtml(o.retailer_url)}" /></label>
        <label>Best DK price URL<input data-i="${i}" data-k="best_price_url" value="${escapeHtml(o.best_price_url ?? '')}" placeholder="https://www.power.dk/..." /></label>
        <label>Last verified<input data-i="${i}" data-k="last_verified" type="date" value="${escapeHtml(o.last_verified)}" /></label>
      </div>
      <label>Excerpt<textarea data-i="${i}" data-k="excerpt" rows="2">${escapeHtml(o.excerpt)}</textarea></label>
      <button data-i="${i}" data-action="remove-option">Remove option</button>
    `;
    list.appendChild(card);
  });
  list.querySelectorAll('input, textarea').forEach((el) => {
    el.addEventListener('input', () => {
      const i = +el.dataset.i; const k = el.dataset.k;
      const v = el.type === 'number' ? (el.value === '' ? null : +el.value) : el.value;
      state.decision.options[i][k] = v;
      renderScorePanel();
    });
  });
  list.querySelectorAll('button[data-action="remove-option"]').forEach((b) => {
    b.addEventListener('click', () => { state.decision.options.splice(+b.dataset.i, 1); renderEditor(); });
  });
}

function renderScorePanel() {
  const area = $('#score-area');
  area.innerHTML = '';
  if (state.decision.method === 'weighted') area.appendChild(buildWeightedPanel());
  else if (state.decision.method === 'pugh') area.appendChild(buildPughPanel());
  else area.appendChild(buildPairwisePanel());
  renderRanking();
}

function buildWeightedPanel() {
  const tbl = document.createElement('table');
  const head = ['Option', ...state.decision.criteria.map((c) => c.name)];
  tbl.innerHTML = `<thead><tr>${head.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>`;
  const tbody = document.createElement('tbody');
  state.decision.options.forEach((o, i) => {
    const cells = state.decision.criteria.map((c) =>
      `<td><input data-i="${i}" data-c="${escapeHtml(c.name)}" type="number" min="0" max="10" value="${o.scores?.[c.name] ?? ''}" /></td>`).join('');
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHtml(o.name) || '(unnamed)'}${priceHtml(o)}${bestPriceHtml(o)}</td>${cells}`;
    tbody.appendChild(tr);
  });
  tbl.appendChild(tbody);
  tbl.querySelectorAll('input').forEach((el) => {
    el.addEventListener('input', () => {
      const i = +el.dataset.i; const c = el.dataset.c;
      state.decision.options[i].scores ??= {};
      state.decision.options[i].scores[c] = el.value === '' ? 0 : +el.value;
      renderRanking();
    });
  });
  return tbl;
}

function buildPughPanel() {
  const wrap = document.createElement('div');
  const picker = document.createElement('label');
  picker.innerHTML = `Baseline: <select id="baseline">${
    state.decision.options.map((o) => `<option value="${o.id}" ${state.decision.baseline_option === o.id ? 'selected' : ''}>${escapeHtml((o.name || o.id) + priceText(o))}</option>`).join('')
  }</select>`;
  wrap.appendChild(picker);
  picker.querySelector('select').addEventListener('change', (e) => {
    state.decision.baseline_option = e.target.value;
    renderScorePanel();
  });
  const tbl = document.createElement('table');
  tbl.innerHTML = `<thead><tr><th>Option</th>${state.decision.criteria.map((c) => `<th>${escapeHtml(c.name)}</th>`).join('')}</tr></thead>`;
  const tbody = document.createElement('tbody');
  state.decision.options.forEach((o, i) => {
    if (o.id === state.decision.baseline_option) {
      tbody.innerHTML += `<tr><td>${escapeHtml(o.name)}${priceHtml(o)}${bestPriceHtml(o)} (baseline)</td>${state.decision.criteria.map(() => '<td>0</td>').join('')}</tr>`;
      return;
    }
    const cells = state.decision.criteria.map((c) =>
      `<td><select data-i="${i}" data-c="${escapeHtml(c.name)}">
        <option value="-1" ${o.pugh?.[c.name] === -1 ? 'selected' : ''}>−</option>
        <option value="0" ${(o.pugh?.[c.name] ?? 0) === 0 ? 'selected' : ''}>=</option>
        <option value="1" ${o.pugh?.[c.name] === 1 ? 'selected' : ''}>+</option>
      </select></td>`).join('');
    tbody.innerHTML += `<tr><td>${escapeHtml(o.name) || '(unnamed)'}${priceHtml(o)}${bestPriceHtml(o)}</td>${cells}</tr>`;
  });
  tbl.appendChild(tbody);
  wrap.appendChild(tbl);
  wrap.querySelectorAll('select[data-i]').forEach((el) => {
    el.addEventListener('change', () => {
      const i = +el.dataset.i; const c = el.dataset.c;
      state.decision.options[i].pugh ??= {};
      state.decision.options[i].pugh[c] = +el.value;
      renderRanking();
    });
  });
  return wrap;
}

function buildPairwisePanel() {
  const wrap = document.createElement('div');
  if (state.decision.options.length > 6) {
    wrap.textContent = 'Pairwise is capped at 6 options. Reduce options or switch method.';
    return wrap;
  }
  for (const c of state.decision.criteria) {
    const h = document.createElement('h5');
    h.textContent = c.name;
    wrap.appendChild(h);
    const sorted = [...state.decision.options].sort((a, b) => (a.id < b.id ? -1 : 1));
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i]; const b = sorted[j];
        const stored = a.pairwise?.[c.name]?.[b.id] ?? 1;
        const row = document.createElement('label');
        row.style.display = 'flex'; row.style.gap = '6px';
        row.innerHTML = `${escapeHtml(a.name) || a.id}${priceHtml(a)} vs ${escapeHtml(b.name) || b.id}${priceHtml(b)}:
          <select data-aid="${a.id}" data-bid="${b.id}" data-c="${escapeHtml(c.name)}">
            ${[1/9, 1/7, 1/5, 1/3, 1, 3, 5, 7, 9].map((v) => `<option value="${v}" ${Math.abs(v - stored) < 1e-6 ? 'selected' : ''}>${v < 1 ? `1/${Math.round(1/v)}` : v}</option>`).join('')}
          </select>`;
        row.querySelector('select').addEventListener('change', (e) => {
          const opt = state.decision.options.find((o) => o.id === a.id);
          opt.pairwise ??= {};
          opt.pairwise[c.name] ??= {};
          opt.pairwise[c.name][b.id] = parseFloat(e.target.value);
          renderRanking();
        });
        wrap.appendChild(row);
      }
    }
  }
  return wrap;
}

function renderRanking() {
  const ol = $('#ranking');
  ol.innerHTML = '';
  let ranked = [];
  if (state.decision.method === 'weighted') ranked = scoreWeighted(state.decision);
  else if (state.decision.method === 'pugh') ranked = scorePugh(state.decision);
  else ranked = scorePairwise(state.decision);
  for (const r of ranked) {
    const li = document.createElement('li');
    const score = state.decision.method === 'pugh' ? r.score : r.score.toFixed(2);
    const opt = state.decision.options.find((o) => o.id === r.id);
    li.innerHTML = `${escapeHtml(r.name || r.id)}${priceHtml(opt)}${bestPriceHtml(opt)} — ${escapeHtml(String(score))}`;
    ol.appendChild(li);
  }
}

function renderEditor() {
  $('#editor').hidden = false;
  $('#title').value = state.decision.title ?? '';
  $('#method').value = state.decision.method ?? 'weighted';
  $('#phase').value = state.decision.phase ?? '';
  $('#budget').value = state.decision.budget_dkk ?? '';
  $('#stretch-ceiling').value = state.decision.stretch_ceiling_dkk ?? '';
  $('#apartment-m2').value = state.decision.apartment_m2 ?? '';
  $('#notes').value = state.decision.notes ?? '';
  $('#decision-text').value = state.decision.decision ?? '';
  renderCriteria();
  renderOptions();
  renderScorePanel();
}

$('#new-decision').addEventListener('click', newDecision);
$('#save').addEventListener('click', save);
$('#export').addEventListener('click', exportMarkdown);
$('#add-criterion').addEventListener('click', () => {
  state.decision ??= emptyDecision();
  state.decision.criteria.push({ name: '', weight: 1 });
  renderEditor();
});
$('#add-option').addEventListener('click', () => {
  state.decision ??= emptyDecision();
  state.decision.options.push(newOption());
  renderEditor();
});
$('#method').addEventListener('change', (e) => { if (state.decision) { state.decision.method = e.target.value; renderEditor(); } });
$('#title').addEventListener('input', (e) => { if (state.decision) state.decision.title = e.target.value; });
$('#phase').addEventListener('input', (e) => { if (state.decision) state.decision.phase = e.target.value ? +e.target.value : null; });
$('#budget').addEventListener('input', (e) => { if (state.decision) state.decision.budget_dkk = e.target.value ? +e.target.value : null; });
$('#stretch-ceiling').addEventListener('input', (e) => { if (state.decision) state.decision.stretch_ceiling_dkk = e.target.value ? +e.target.value : null; });
$('#apartment-m2').addEventListener('input', (e) => { if (state.decision) state.decision.apartment_m2 = e.target.value ? +e.target.value : null; });
$('#notes').addEventListener('input', (e) => { if (state.decision) state.decision.notes = e.target.value; });
$('#decision-text').addEventListener('input', (e) => { if (state.decision) state.decision.decision = e.target.value || null; });

loadList();
