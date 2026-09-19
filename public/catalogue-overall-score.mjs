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
