function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function variantId(value) {
  return isRecord(value) ? String(value.id || value.label || '').trim().toLowerCase() : '';
}

function mergeVariantRecord(base, override) {
  const left = isRecord(base) ? base : {};
  const right = isRecord(override) ? override : {};
  const merged = { ...left, ...right };

  if (Object.prototype.hasOwnProperty.call(right, 'sizeVariants')) {
    merged.sizeVariants = mergeVariantList(left.sizeVariants, right.sizeVariants);
  } else if (Array.isArray(left.sizeVariants)) {
    merged.sizeVariants = left.sizeVariants.map(item => isRecord(item) ? { ...item } : item);
  }

  if (Object.prototype.hasOwnProperty.call(right, 'blendVariants')) {
    merged.blendVariants = mergeVariantList(left.blendVariants, right.blendVariants);
  } else if (Array.isArray(left.blendVariants)) {
    merged.blendVariants = left.blendVariants.map(item => isRecord(item) ? { ...item } : item);
  }

  return merged;
}

export function mergeVariantList(baseList, overrideList) {
  const base = Array.isArray(baseList) ? baseList : [];
  if (!Array.isArray(overrideList)) {
    return base.map(item => isRecord(item) ? { ...item } : item);
  }
  if (overrideList.length === 0) return [];

  const overrides = new Map();
  for (const item of overrideList) {
    const id = variantId(item);
    if (id) overrides.set(id, item);
  }

  const output = [];
  const seen = new Set();
  for (const item of base) {
    const id = variantId(item);
    if (!id) {
      output.push(isRecord(item) ? { ...item } : item);
      continue;
    }
    const patch = overrides.get(id);
    output.push(patch ? mergeVariantRecord(item, patch) : mergeVariantRecord(item, {}));
    seen.add(id);
  }

  for (const item of overrideList) {
    const id = variantId(item);
    if (!id || seen.has(id)) continue;
    output.push(mergeVariantRecord({}, item));
    seen.add(id);
  }
  return output;
}

export function mergeCatalogueRecord(entry, cardOverride, key = '') {
  const base = isRecord(entry) ? entry : {};
  const override = isRecord(cardOverride) ? cardOverride : {};
  const merged = { ...base, ...override };

  if (key) merged.key = key;
  else if (!merged.key && base.key) merged.key = base.key;

  if (Object.prototype.hasOwnProperty.call(override, 'sizeVariants')) {
    merged.sizeVariants = mergeVariantList(base.sizeVariants, override.sizeVariants);
  } else if (Array.isArray(base.sizeVariants)) {
    merged.sizeVariants = mergeVariantList(base.sizeVariants, undefined);
  }

  if (Object.prototype.hasOwnProperty.call(override, 'blendVariants')) {
    merged.blendVariants = mergeVariantList(base.blendVariants, override.blendVariants);
  } else if (Array.isArray(base.blendVariants)) {
    merged.blendVariants = mergeVariantList(base.blendVariants, undefined);
  }

  return merged;
}

export function catalogueRecordFromState(state, key) {
  const safeKey = String(key || '').trim();
  if (!safeKey) return null;
  const entry = state?.entries?.[safeKey];
  const card = state?.cards?.[safeKey];
  if (!isRecord(entry) && !isRecord(card)) return null;
  return mergeCatalogueRecord(entry, card, safeKey);
}
