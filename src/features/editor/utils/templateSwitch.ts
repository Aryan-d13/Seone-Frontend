import type { AssetDef, TemplateJSON } from '../types/template';

function cloneTemplate(template: TemplateJSON): TemplateJSON {
  return JSON.parse(JSON.stringify(template));
}

function hasUsableAssetRef(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const normalized = value.trim();
  if (!normalized) return false;
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(normalized)) return true;
  if (normalized.startsWith('/')) return true;
  if (normalized.includes('/')) return true;
  return false;
}

function hasRemoteAssetRef(asset: AssetDef | undefined): boolean {
  if (!asset) return false;
  return [asset.source_uri, asset.gcs_path, asset.path].some(hasUsableAssetRef);
}

export function mergeTemplateForStudioSwitch(
  currentTemplate: TemplateJSON,
  nextTemplate: TemplateJSON
): TemplateJSON {
  const mergedTemplate = cloneTemplate(nextTemplate);
  const currentAssets = currentTemplate.assets || {};

  for (const [assetKey, asset] of Object.entries(currentAssets)) {
    if (asset.type === 'font' && !mergedTemplate.assets[assetKey]) {
      mergedTemplate.assets[assetKey] = { ...asset };
      continue;
    }

    const targetAsset = mergedTemplate.assets[assetKey];
    if (!targetAsset) continue;

    if (hasRemoteAssetRef(targetAsset)) continue;
    if (!hasRemoteAssetRef(asset)) continue;

    mergedTemplate.assets[assetKey] = {
      ...targetAsset,
      ...(asset.path ? { path: asset.path } : {}),
      ...(asset.source_uri ? { source_uri: asset.source_uri } : {}),
      ...(asset.gcs_path ? { gcs_path: asset.gcs_path } : {}),
    };
  }

  return mergedTemplate;
}
