'use client';

import { useEffect, useRef } from 'react';
import { inferFontFamily, inferFontStyle, inferFontWeight } from '../../lib/fontAssets';
import {
  acquireProtectedAssetUrl,
  PROTECTED_ASSET_AUTH_MESSAGE,
  PROTECTED_ASSET_LOAD_MESSAGE,
  ProtectedAssetLoadError,
  releaseProtectedAssetUrl,
} from '../../lib/protectedAssetLoader';
import { useTemplateStore } from '../../store/templateStore';
import { getAssetPreviewUrl, getTemplateAssetProxyUrl } from '../../utils/assetPreview';

interface RegisteredFontHandle {
  key: string;
  objectUrl?: string;
  fontFace?: FontFace;
  protectedUrl?: string;
}

export default function TemplateFontRegistrar() {
  const { template, activeManifest, getPendingFiles, setAssetPreviewError } = useTemplateStore();
  const registeredRef = useRef<Map<string, RegisteredFontHandle>>(new Map());
  const pendingFiles = getPendingFiles();

  useEffect(() => {
    if (typeof window === 'undefined' || typeof FontFace === 'undefined' || !document.fonts) {
      return;
    }

    const nextHandles = new Map<string, RegisteredFontHandle>();
    const fontAssets = new Map(Object.entries(template.assets || {}).filter(([, asset]) => asset.type === 'font'));
    for (const [assetKey, file] of Object.entries(pendingFiles)) {
      if (fontAssets.has(assetKey)) continue;
      fontAssets.set(assetKey, {
        type: 'font',
        path: file.name,
        family: inferFontFamily(file.name),
        weight: inferFontWeight(file.name),
        style: inferFontStyle(file.name),
      });
    }

    for (const [assetKey, asset] of fontAssets.entries()) {
      if (!asset.family) continue;
      const family = asset.family!;
      const weight = String(asset.weight || 400);
      const style = String(asset.style || 'normal');
      const pendingFile = pendingFiles[assetKey];
      const directPreviewUrl = getAssetPreviewUrl(asset, activeManifest?.assets?.[assetKey]);
      const protectedPreviewUrl =
        pendingFile || directPreviewUrl ? null : getTemplateAssetProxyUrl(template.id, assetKey);

      if (pendingFile) {
        const objectUrl = URL.createObjectURL(pendingFile);
        const registrationKey = `${assetKey}:${family}:${weight}:${style}:${objectUrl}`;
        nextHandles.set(registrationKey, { key: registrationKey, objectUrl });
        if (registeredRef.current.has(registrationKey)) continue;
        const face = new FontFace(family, `url("${objectUrl}")`, { weight, style });
        face.load().then((loadedFace) => {
          document.fonts.add(loadedFace);
          const handle = nextHandles.get(registrationKey) || registeredRef.current.get(registrationKey);
          if (handle) {
            handle.fontFace = loadedFace;
            registeredRef.current.set(registrationKey, handle);
          }
        }).catch(() => URL.revokeObjectURL(objectUrl));
        registeredRef.current.set(registrationKey, { key: registrationKey, objectUrl, fontFace: face });
        continue;
      }

      if (directPreviewUrl) {
        const registrationKey = `${assetKey}:${family}:${weight}:${style}:${directPreviewUrl}`;
        nextHandles.set(registrationKey, { key: registrationKey });
        if (registeredRef.current.has(registrationKey)) continue;
        const face = new FontFace(family, `url("${directPreviewUrl}")`, { weight, style });
        face.load().then((loadedFace) => {
          document.fonts.add(loadedFace);
          const handle = nextHandles.get(registrationKey) || registeredRef.current.get(registrationKey);
          if (handle) {
            handle.fontFace = loadedFace;
            registeredRef.current.set(registrationKey, handle);
          }
        }).catch(() => undefined);
        registeredRef.current.set(registrationKey, { key: registrationKey, fontFace: face });
        continue;
      }

      if (protectedPreviewUrl) {
        const registrationKey = `${assetKey}:${family}:${weight}:${style}:${protectedPreviewUrl}`;
        nextHandles.set(registrationKey, { key: registrationKey, protectedUrl: protectedPreviewUrl });
        if (registeredRef.current.has(registrationKey)) continue;
        acquireProtectedAssetUrl(protectedPreviewUrl)
          .then((protectedObjectUrl) => {
            const face = new FontFace(family, `url("${protectedObjectUrl}")`, { weight, style });
            return face.load().then((loadedFace) => ({ loadedFace, face, protectedObjectUrl }));
          })
          .then(({ loadedFace, protectedObjectUrl }) => {
            document.fonts.add(loadedFace);
            const handle = nextHandles.get(registrationKey) || registeredRef.current.get(registrationKey);
            if (handle) {
              handle.fontFace = loadedFace;
              handle.objectUrl = protectedObjectUrl;
              handle.protectedUrl = protectedPreviewUrl;
              registeredRef.current.set(registrationKey, handle);
            } else {
              releaseProtectedAssetUrl(protectedPreviewUrl);
            }
            setAssetPreviewError(null);
            const existingHandle = registeredRef.current.get(registrationKey);
            registeredRef.current.set(registrationKey, {
              ...(existingHandle || {}),
              key: registrationKey,
              fontFace: loadedFace,
              objectUrl: protectedObjectUrl,
              protectedUrl: protectedPreviewUrl,
            });
          })
          .catch((error) => {
            if (error instanceof ProtectedAssetLoadError && error.code === 'unauthorized') {
              setAssetPreviewError(PROTECTED_ASSET_AUTH_MESSAGE);
              return;
            }
            setAssetPreviewError(PROTECTED_ASSET_LOAD_MESSAGE);
          });
      }
    }

    for (const [key, handle] of registeredRef.current.entries()) {
      if (nextHandles.has(key)) continue;
      if (handle.fontFace) {
        document.fonts.delete(handle.fontFace);
      }
      if (handle.objectUrl && !handle.protectedUrl) {
        URL.revokeObjectURL(handle.objectUrl);
      }
      if (handle.protectedUrl) {
        releaseProtectedAssetUrl(handle.protectedUrl);
      }
      registeredRef.current.delete(key);
    }

    return () => {
      for (const handle of registeredRef.current.values()) {
        if (handle.fontFace) {
          document.fonts.delete(handle.fontFace);
        }
        if (handle.objectUrl && !handle.protectedUrl) {
          URL.revokeObjectURL(handle.objectUrl);
        }
        if (handle.protectedUrl) {
          releaseProtectedAssetUrl(handle.protectedUrl);
        }
      }
      registeredRef.current.clear();
    };
  }, [activeManifest?.assets, pendingFiles, setAssetPreviewError, template.assets, template.id]);

  return null;
}
