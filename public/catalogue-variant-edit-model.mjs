import {
  blendEffectiveRecord,
  normaliseBlendVariants,
  normaliseVariants,
  variantSlug
} from './catalogue-variants.mjs?v=blend-variants-1';

const clone = value => JSON.parse(JSON.stringify(value ?? null));
const own = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);

function rawId(raw = {}) {
  return variantSlug(raw.id || raw.label || raw.name || raw.vitola || raw.blend);
}

function mergeVariant(listInput, id, patch) {
  const list = Array.isArray(listInput) ? clone(listInput) : [];
  const wanted = variantSlug(id);
  const index = list.findIndex(item => rawId(item) === wanted);
  if (index < 0) throw new Error(`Variant "${id}" was not found.`);
  list[index] = { ...list[index], ...clone(patch), id:list[index].id || wanted };
  return list;
}

export function updateBlendVariant(recordInput, blendVariantId, patch) {
  const record = clone(recordInput) || {};
  if (!normaliseBlendVariants(record).some(item => item.id === variantSlug(blendVariantId))) {
    throw new Error(`Blend variant "${blendVariantId}" was not found.`);
  }
  record.blendVariants = mergeVariant(record.blendVariants, blendVariantId, patch);
  return record;
}

export function updateSizeVariant(recordInput, sizeVariantId, patch, blendVariantId = '') {
  const record = clone(recordInput) || {};
  const wantedSize = variantSlug(sizeVariantId);
  const wantedBlend = variantSlug(blendVariantId);
  const blends = normaliseBlendVariants(record);

  if (wantedBlend && blends.length) {
    const blendIndex = (record.blendVariants || []).findIndex(item => rawId(item) === wantedBlend);
    if (blendIndex < 0) throw new Error(`Blend variant "${blendVariantId}" was not found.`);
    const baseBlendId = blends[0]?.id || '';
    const rawBlend = record.blendVariants[blendIndex];
    const shouldNestInBlend = wantedBlend !== baseBlendId || Array.isArray(rawBlend?.sizeVariants);

    if (shouldNestInBlend) {
      const source = Array.isArray(rawBlend.sizeVariants)
        ? rawBlend.sizeVariants
        : normaliseVariants(blendEffectiveRecord(record, wantedBlend).record);
      if (!normaliseVariants({ sizeVariants:source }).some(item => item.id === wantedSize)) {
        throw new Error(`Size variant "${sizeVariantId}" was not found in blend "${blendVariantId}".`);
      }
      record.blendVariants[blendIndex] = {
        ...rawBlend,
        sizeVariants:mergeVariant(source, wantedSize, patch)
      };
      return record;
    }
  }

  if (!normaliseVariants(record).some(item => item.id === wantedSize)) {
    throw new Error(`Size variant "${sizeVariantId}" was not found.`);
  }
  record.sizeVariants = mergeVariant(record.sizeVariants, wantedSize, patch);
  return record;
}

export function updateVariantScopedCopy(recordInput, context = {}, patch = {}) {
  let record = clone(recordInput) || {};
  const blendId = variantSlug(context.blendVariantId);
  const sizeId = variantSlug(context.sizeVariantId);

  const sizePatch = {};
  for (const key of ['summaryHtml','noteHtml','eyebrow','practicalLines']) {
    if (own(patch, key)) sizePatch[key] = patch[key];
  }
  const blendPatch = {};
  for (const key of ['productionLines','experienceTags']) {
    if (own(patch, key)) blendPatch[key] = patch[key];
  }

  if (sizeId && Object.keys(sizePatch).length) {
    record = updateSizeVariant(record, sizeId, sizePatch, blendId);
  } else if (blendId && Object.keys(sizePatch).length) {
    Object.assign(blendPatch, sizePatch);
  } else {
    Object.assign(record, sizePatch);
  }

  if (blendId && Object.keys(blendPatch).length) {
    record = updateBlendVariant(record, blendId, blendPatch);
  } else if (Object.keys(blendPatch).length) {
    Object.assign(record, blendPatch);
  }

  return record;
}

export function variantEditSnapshot(record, kind, blendVariantId = '', sizeVariantId = '') {
  const blendId = variantSlug(blendVariantId);
  const sizeId = variantSlug(sizeVariantId);
  if (kind === 'blend') {
    const resolved = blendEffectiveRecord(record, blendId);
    return { id:resolved.blendVariantId, raw:resolved.blendVariant, effective:resolved.record };
  }
  const blended = blendId ? blendEffectiveRecord(record, blendId).record : record;
  const variants = normaliseVariants(blended);
  const variant = variants.find(item => item.id === sizeId) || null;
  if (!variant) return { id:'', raw:null, effective:blended };
  const effective = { ...blended };
  for (const [key, value] of Object.entries(variant)) {
    if (!['id','label','priceUnverified'].includes(key)) effective[key] = value;
  }
  return { id:variant.id, raw:variant, effective };
}
