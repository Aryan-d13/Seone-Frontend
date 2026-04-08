'use client';

import { type MutableRefObject, useEffect, useRef } from 'react';
import { useFontCatalog } from '@/hooks/useFontCatalog';
import {
  analyzeFontFile,
  analyzeFontUrl,
  inferFontFamily,
  inferFontStyle,
  inferFontWeight,
} from '../../lib/fontAssets';
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

function registerFontFace({
  registrationKey,
  family,
  weight,
  style,
  sourceUrl,
  nextHandles,
  registeredRef,
}: {
  registrationKey: string;
  family: string;
  weight: string;
  style: string;
  sourceUrl: string;
  nextHandles: Map<string, RegisteredFontHandle>;
  registeredRef: MutableRefObject<Map<string, RegisteredFontHandle>>;
}) {
  nextHandles.set(registrationKey, { key: registrationKey });
  if (registeredRef.current.has(registrationKey)) return;

  const face = new FontFace(family, `url("${sourceUrl}")`, { weight, style });
  face
    .load()
    .then(loadedFace => {
      document.fonts.add(loadedFace);
      const handle =
        nextHandles.get(registrationKey) || registeredRef.current.get(registrationKey);
      if (handle) {
        handle.fontFace = loadedFace;
        registeredRef.current.set(registrationKey, handle);
      }
    })
    .catch(() => undefined);
  registeredRef.current.set(registrationKey, {
    key: registrationKey,
    fontFace: face,
  });
}

export default function TemplateFontRegistrar() {
  const { fonts: builtinFonts } = useFontCatalog();
  const {
    template,
    activeManifest,
    getPendingFiles,
    setAssetPreviewError,
    fontAnalysis,
    setFontAnalysis,
    hydrateAssetMetadata,
  } = useTemplateStore();
  const registeredRef = useRef<Map<string, RegisteredFontHandle>>(new Map());
  const analyzingRef = useRef<Set<string>>(new Set());
  const pendingFiles = getPendingFiles();

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      typeof FontFace === 'undefined' ||
      !document.fonts
    ) {
      return;
    }

    const nextHandles = new Map<string, RegisteredFontHandle>();

    for (const builtinFont of builtinFonts) {
      if (builtinFont.source !== 'builtin') continue;
      for (const file of builtinFont.files || []) {
        if (!file.preview_url) continue;
        const style = String(file.style || 'normal');
        const weights =
          Array.isArray(file.weights) && file.weights.length > 0 ? file.weights : [400];
        for (const rawWeight of weights) {
          const weight = String(rawWeight || 400);
          const registrationKey = `builtin:${builtinFont.family}:${weight}:${style}:${file.preview_url}`;
          registerFontFace({
            registrationKey,
            family: builtinFont.family,
            weight,
            style,
            sourceUrl: file.preview_url,
            nextHandles,
            registeredRef,
          });
        }
      }
    }

    const fontAssets = new Map(
      Object.entries(template.assets || {}).filter(([, asset]) => asset.type === 'font')
    );
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
      const currentAnalysis = fontAnalysis[assetKey];
      if (Array.isArray(asset.scripts) && asset.scripts.length > 0 && currentAnalysis?.state !== 'ready') {
        setFontAnalysis(assetKey, {
          scripts: asset.scripts,
          state: 'ready',
        });
      }
      const family = asset.family!;
      const weight = String(asset.weight || 400);
      const style = String(asset.style || 'normal');
      const pendingFile = pendingFiles[assetKey];
      const directPreviewUrl = getAssetPreviewUrl(
        asset,
        activeManifest?.assets?.[assetKey]
      );
      const protectedPreviewUrl =
        pendingFile || directPreviewUrl
          ? null
          : getTemplateAssetProxyUrl(template.id, assetKey);

      const shouldAnalyze =
        !(asset.scripts && asset.scripts.length > 0) &&
        currentAnalysis?.state !== 'ready' &&
        !analyzingRef.current.has(assetKey);

      if (pendingFile && shouldAnalyze) {
        analyzingRef.current.add(assetKey);
        setFontAnalysis(assetKey, { scripts: [], state: 'pending' });
        void analyzeFontFile(pendingFile)
          .then(scripts => {
            setFontAnalysis(assetKey, { scripts, state: 'ready' });
            hydrateAssetMetadata(assetKey, { scripts });
          })
          .catch(error => {
            setFontAnalysis(assetKey, {
              scripts: [],
              state: 'failed',
              error: error instanceof Error ? error.message : 'Font analysis failed',
            });
          })
          .finally(() => {
            analyzingRef.current.delete(assetKey);
          });
      } else if (directPreviewUrl && shouldAnalyze) {
        analyzingRef.current.add(assetKey);
        setFontAnalysis(assetKey, { scripts: [], state: 'pending' });
        void analyzeFontUrl(directPreviewUrl)
          .then(scripts => {
            setFontAnalysis(assetKey, { scripts, state: 'ready' });
            hydrateAssetMetadata(assetKey, { scripts });
          })
          .catch(error => {
            setFontAnalysis(assetKey, {
              scripts: [],
              state: 'failed',
              error: error instanceof Error ? error.message : 'Font analysis failed',
            });
          })
          .finally(() => {
            analyzingRef.current.delete(assetKey);
          });
      }

      if (pendingFile) {
        const objectUrl = URL.createObjectURL(pendingFile);
        const registrationKey = `${assetKey}:${family}:${weight}:${style}:${objectUrl}`;
        nextHandles.set(registrationKey, { key: registrationKey, objectUrl });
        if (registeredRef.current.has(registrationKey)) continue;
        const face = new FontFace(family, `url("${objectUrl}")`, { weight, style });
        face
          .load()
          .then(loadedFace => {
            document.fonts.add(loadedFace);
            const handle =
              nextHandles.get(registrationKey) ||
              registeredRef.current.get(registrationKey);
            if (handle) {
              handle.fontFace = loadedFace;
              registeredRef.current.set(registrationKey, handle);
            }
          })
          .catch(() => URL.revokeObjectURL(objectUrl));
        registeredRef.current.set(registrationKey, {
          key: registrationKey,
          objectUrl,
          fontFace: face,
        });
        continue;
      }

      if (directPreviewUrl) {
        const registrationKey = `${assetKey}:${family}:${weight}:${style}:${directPreviewUrl}`;
        registerFontFace({
          registrationKey,
          family,
          weight,
          style,
          sourceUrl: directPreviewUrl,
          nextHandles,
          registeredRef,
        });
        continue;
      }

      if (protectedPreviewUrl) {
        const registrationKey = `${assetKey}:${family}:${weight}:${style}:${protectedPreviewUrl}`;
        nextHandles.set(registrationKey, {
          key: registrationKey,
          protectedUrl: protectedPreviewUrl,
        });
        if (registeredRef.current.has(registrationKey)) continue;
        acquireProtectedAssetUrl(protectedPreviewUrl)
          .then(protectedObjectUrl => {
            const face = new FontFace(family, `url("${protectedObjectUrl}")`, {
              weight,
              style,
            });
            return face
              .load()
              .then(loadedFace => ({ loadedFace, face, protectedObjectUrl }));
          })
          .then(({ loadedFace, protectedObjectUrl }) => {
            document.fonts.add(loadedFace);
            const handle =
              nextHandles.get(registrationKey) ||
              registeredRef.current.get(registrationKey);
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
          .catch(error => {
            if (
              error instanceof ProtectedAssetLoadError &&
              error.code === 'unauthorized'
            ) {
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
  }, [
    activeManifest?.assets,
    builtinFonts,
    fontAnalysis,
    pendingFiles,
    hydrateAssetMetadata,
    setAssetPreviewError,
    setFontAnalysis,
    template.assets,
    template.id,
  ]);

  return null;
}
