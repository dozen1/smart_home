export function scoreWeighted(decision) {
  const criteria = decision.criteria ?? [];
  const totalWeight = criteria.reduce((s, c) => s + (c.weight ?? 0), 0);
  const ranked = (decision.options ?? []).map((opt) => {
    if (totalWeight <= 0) return { id: opt.id, name: opt.name, score: 0 };
    const sum = criteria.reduce((s, c) => {
      const raw = (opt.scores ?? {})[c.name] ?? 0;
      const adjusted = c.lower_is_better ? (10 - raw) : raw;
      return s + adjusted * (c.weight ?? 0);
    }, 0);
    return { id: opt.id, name: opt.name, score: sum / totalWeight };
  });
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

export function scorePugh(decision) {
  const criteria = decision.criteria ?? [];
  const ranked = (decision.options ?? []).map((opt) => {
    if (opt.id === decision.baseline_option) {
      return { id: opt.id, name: opt.name, score: 0 };
    }
    const sum = criteria.reduce((s, c) => {
      const sign = (opt.pugh ?? {})[c.name] ?? 0;
      return s + sign * (c.weight ?? 0);
    }, 0);
    return { id: opt.id, name: opt.name, score: sum };
  });
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

function pairwiseValue(option, otherId, criterion, allOptions) {
  if (option.id < otherId) {
    return (option.pairwise?.[criterion]?.[otherId]) ?? 1;
  }
  const other = allOptions.find((o) => o.id === otherId);
  const stored = other?.pairwise?.[criterion]?.[option.id];
  return stored ? 1 / stored : 1;
}

function priorityVectorForCriterion(criterion, options) {
  const n = options.length;
  if (n === 0) return [];
  const M = Array.from({ length: n }, () => Array(n).fill(1));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      M[i][j] = pairwiseValue(options[i], options[j].id, criterion, options);
    }
  }
  const colSums = Array(n).fill(0);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) colSums[j] += M[i][j];
  }
  const priorities = Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let rowSum = 0;
    for (let j = 0; j < n; j++) {
      rowSum += colSums[j] === 0 ? 0 : M[i][j] / colSums[j];
    }
    priorities[i] = rowSum / n;
  }
  return priorities;
}

export function scorePairwise(decision) {
  const options = decision.options ?? [];
  const criteria = decision.criteria ?? [];
  const totalWeight = criteria.reduce((s, c) => s + (c.weight ?? 0), 0);
  if (options.length === 0 || totalWeight <= 0) {
    return options.map((o) => ({ id: o.id, name: o.name, score: 0 }));
  }
  const finalScores = Array(options.length).fill(0);
  for (const c of criteria) {
    const v = priorityVectorForCriterion(c.name, options);
    for (let i = 0; i < options.length; i++) {
      finalScores[i] += (c.weight ?? 0) * v[i];
    }
  }
  const ranked = options.map((o, i) => ({ id: o.id, name: o.name, score: finalScores[i] / totalWeight }));
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}
