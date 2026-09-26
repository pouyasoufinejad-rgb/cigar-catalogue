// The weighted overall rating out of 100.
//
// Deliberately separate from deriveAutoLaurel: this score has no bearing on Gem or Crown
// eligibility, which counts Gold fields and nothing else. Keeping them in different modules
// makes it hard to accidentally wire one into the other.

// Each field is scored 1-10, so the weights sum to 100 exactly. Flavour carries the
// heaviest single share because the catalogue rates flavour intensity and complexity above
// everything else; the 0.4 it gained came straight out of Size, which describes the format
// rather than the smoke.
export const SCORE_WEIGHTS = Object.freeze({
  flavour: 3.4,
  quality: 3,
  size: 1.6,
  value: 1.2,
  strength: 0.8
});

// Flavour is the one rating that can legitimately be absent: a cigar nobody has smoked has
// no flavour score, and that is not the same as a score of zero. It lives here rather than
// in the DOM-facing flavour module so the Worker can share this exact definition instead of
// keeping a second copy that drifts.
export function normaliseFlavour(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(1, Math.min(10, Math.round(number)));
}

export function flavourTier(value) {
  return value >= 7 ? 'gold' : value >= 5 ? 'silver' : 'bronze';
}

// The Flavour medal was only ever injected by the client, so a freshly served card showed
// Strength, Quality, Size and Value with a gap where Flavour belongs until scripts ran.
// Rendering it here means the server and the client emit the same node, and the client's
// injector finds it already present rather than building a second one.
export function flavourRatingMarkup(value) {
  const score = normaliseFlavour(value);
  if (score === null) {
    return '<div class="rating flavour-unrated"><span>Flavour</span><i aria-hidden="true" class="medal flavour-unrated-medal"></i><b>Unrated</b><small class="subscore">\u2014</small></div>';
  }
  const tier = flavourTier(score);
  const scoreClass = score >= 8 ? 'score-high' : score >= 5 ? 'score-mid' : 'score-low';
  return `<div class="rating ${tier} ${scoreClass}"><span>Flavour</span><i aria-hidden="true" class="medal ${tier}"></i><b>${tier[0].toUpperCase() + tier.slice(1)}</b><small class="subscore">${score}/10</small></div>`;
}

function ratedScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return Math.min(10, Math.max(1, number));
}

// Flavour stays unrated until a cigar is personally tasted, and it carries 34% of the
// weight. Scoring an unrated field as zero would cap an untasted cigar at 70 and read as a
// judgement the catalogue has not made, so the weights that are present are rescaled back
// up to 100 instead. A card with every field rated is scored by the plain formula.
export function deriveOverallScore(ratings = {}) {
  let earned = 0;
  let available = 0;
  const missing = [];

  for (const [field, weight] of Object.entries(SCORE_WEIGHTS)) {
    const value = ratedScore(ratings[field]);
    if (value === null) {
      missing.push(field);
      continue;
    }
    earned += value * weight;
    available += weight * 10;
  }

  if (!available) return { score: null, provisional: true, missing };
  const score = Math.round((earned / available) * 100);
  return { score, provisional: missing.length > 0, missing };
}

export function overallScoreTier(score) {
  return score >= 80 ? 'gold' : score >= 65 ? 'silver' : 'bronze';
}

export function overallScoreTitle(provisional) {
  return provisional
    ? 'Overall rating out of 100, scaled across the rated categories while Flavour is unrated'
    : 'Overall rating out of 100 across all five categories';
}

// The number carries the meaning on its own, so the card shows the figure and nothing
// else. The denominator and the word live in the title attribute.
export function overallScoreMarkup(ratings = {}) {
  const { score, provisional } = deriveOverallScore(ratings);
  if (score === null) return '';
  return `<span class="overall-score ${overallScoreTier(score)}${provisional ? ' is-provisional' : ''}"`
    + ` title="${overallScoreTitle(provisional)}">${score}</span>`;
}
