import { useEffect, useMemo, useRef, useState } from 'react';
import { Film, ImageIcon, Lock } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  PROTECTED_ASSET_AUTH_MESSAGE,
  PROTECTED_ASSET_LOAD_MESSAGE,
} from '../../lib/protectedAssetLoader';
import { useProtectedAssetUrl } from '../../hooks/useProtectedAssetUrl';
import { useTemplateStore } from '../../store/templateStore';
import type { ResolvedTextLayout, ResolvedZone } from '../../types/manifest';
import type { ZoneSpec } from '../../types/template';
import { getAssetPreviewUrl, getTemplateAssetProxyUrl } from '../../utils/assetPreview';
import {
  clampVideoRectPosition,
  normalizeVideoRect,
  readBoundsAspectRatio,
} from '../../utils/videoBounds';
import './ZoneRenderer.css';

interface Props {
  zone: ZoneSpec;
  scale: number;
  videoSrc?: string | null;
  currentTime?: number;
  isPlaying?: boolean;
  resolvedZone?: ResolvedZone;
  renderMode?: 'editor' | 'rendered' | 'clip';
  assetResolving?: boolean;
  assetFailed?: boolean;
  suppressMediaContent?: boolean;
}

type ResizeDirection =
  | 'top'
  | 'right'
  | 'bottom'
  | 'left'
  | 'topRight'
  | 'bottomRight'
  | 'bottomLeft'
  | 'topLeft';

interface RectState {
  x: number;
  y: number;
  width: number;
  height: number;
}

function coerceNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readLengthSpec(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function cropAnchorToObjectPosition(anchor: unknown): string {
  switch (anchor) {
    case 'top':
      return 'center top';
    case 'bottom':
      return 'center bottom';
    default:
      return 'center center';
  }
}

function normalizeCropFocus(value: unknown): { x: number; y: number } | null {
  if (!value || typeof value !== 'object') return null;
  const focus = value as Record<string, unknown>;
  const x = typeof focus.x === 'number' && Number.isFinite(focus.x) ? focus.x : 0.5;
  const y = typeof focus.y === 'number' && Number.isFinite(focus.y) ? focus.y : 0.5;
  return {
    x: Math.min(Math.max(x, 0), 1),
    y: Math.min(Math.max(y, 0), 1),
  };
}

function verticalAlignToJustifyContent(
  value: unknown
): 'flex-start' | 'center' | 'flex-end' {
  if (value === 'top') return 'flex-start';
  if (value === 'bottom') return 'flex-end';
  return 'center';
}

function horizontalAlignToItems(value: unknown): 'flex-start' | 'center' | 'flex-end' {
  if (value === 'left') return 'flex-start';
  if (value === 'right') return 'flex-end';
  return 'center';
}

function horizontalAlignToText(value: unknown): 'left' | 'center' | 'right' {
  if (value === 'left' || value === 'right') return value;
  return 'center';
}

function isResolvedTextLayout(value: unknown): value is ResolvedTextLayout {
  return Boolean(value) && typeof value === 'object';
}

function readResolvedBox(
  value: unknown
): { x: number; y: number; width: number; height: number } | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const width = Number(candidate.width);
  const height = Number(candidate.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  const x = Number(candidate.x);
  const y = Number(candidate.y);
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    width,
    height,
  };
}

function clampRectDimension(value: number): number {
  return Math.max(10, Math.round(value));
}

function resizeRect(
  origin: RectState,
  direction: ResizeDirection,
  deltaX: number,
  deltaY: number,
  aspectRatio?: number | null
): RectState {
  const next: RectState = { ...origin };

  if (direction.includes('right')) {
    next.width = clampRectDimension(origin.width + deltaX);
  }
  if (direction.includes('left')) {
    const nextWidth = clampRectDimension(origin.width - deltaX);
    next.x = origin.x + (origin.width - nextWidth);
    next.width = nextWidth;
  }
  if (direction.includes('bottom')) {
    next.height = clampRectDimension(origin.height + deltaY);
  }
  if (direction.includes('top')) {
    const nextHeight = clampRectDimension(origin.height - deltaY);
    next.y = origin.y + (origin.height - nextHeight);
    next.height = nextHeight;
  }

  if (!aspectRatio || aspectRatio <= 0) {
    return next;
  }

  const includesHorizontal = direction.includes('left') || direction.includes('right');
  const includesVertical = direction.includes('top') || direction.includes('bottom');

  if (includesHorizontal && !includesVertical) {
    next.height = clampRectDimension(next.width / aspectRatio);
    return next;
  }

  if (includesVertical && !includesHorizontal) {
    next.width = clampRectDimension(next.height * aspectRatio);
    if (direction.includes('left')) {
      next.x = origin.x + (origin.width - next.width);
    }
    return next;
  }

  const widthFromHeight = clampRectDimension(next.height * aspectRatio);
  const heightFromWidth = clampRectDimension(next.width / aspectRatio);
  const widthDelta = Math.abs(next.width - origin.width);
  const heightDelta = Math.abs(next.height - origin.height);

  if (widthDelta >= heightDelta) {
    next.height = heightFromWidth;
  } else {
    next.width = widthFromHeight;
  }

  if (direction.includes('left')) {
    next.x = origin.x + (origin.width - next.width);
  }
  if (direction.includes('top')) {
    next.y = origin.y + (origin.height - next.height);
  }

  return next;
}

export default function ZoneRenderer({
  zone,
  scale,
  videoSrc = null,
  currentTime = 0,
  isPlaying = false,
  resolvedZone,
  renderMode = 'editor',
  assetResolving = false,
  assetFailed = false,
  suppressMediaContent = false,
}: Props) {
  const {
    template,
    selectedZoneId,
    interactionMode,
    editingTextZoneId,
    draftGeometryZoneIds,
    selectZone,
    beginTextEditing,
    endTextEditing,
    updateZoneBounds,
    updateZone,
    isLocked,
    previewTexts,
    setPreviewText,
    setAssetPreviewError,
    uploadedImages,
    activeManifest,
    sourceVideoAspectRatio,
  } = useTemplateStore();

  const videoRef = useRef<HTMLVideoElement>(null);
  const textEditorRef = useRef<HTMLTextAreaElement>(null);
  const liveRectRef = useRef<RectState>({ x: 0, y: 0, width: 0, height: 0 });
  const liveRectFrameRef = useRef<number | null>(null);
  const pendingLiveRectRef = useRef<RectState | null>(null);
  const pointerSessionRef = useRef<{
    pointerId: number;
    mode: 'move' | 'resize';
    direction?: ResizeDirection;
    startX: number;
    startY: number;
    origin: RectState;
    moved: boolean;
  } | null>(null);
  const suppressNextClickRef = useRef(false);
  const [imageAspectRatio, setImageAspectRatio] = useState<number | null>(null);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoLoadFailed, setVideoLoadFailed] = useState(false);
  const [liveRect, setLiveRect] = useState<RectState>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
  const [interactionState, setInteractionState] = useState<'drag' | 'resize' | null>(
    null
  );

  const selected = selectedZoneId === zone.id;
  const locked = isLocked(zone.id);
  const isRenderedMode = renderMode === 'rendered';
  const isClipMode = renderMode === 'clip';
  const isEditingText =
    renderMode !== 'rendered' &&
    interactionMode === 'editing_text' &&
    editingTextZoneId === zone.id &&
    zone.type === 'text';

  const bounds = zone.bounds;
  const resolvedRect = resolvedZone?.rect;
  const textLayout = isResolvedTextLayout(resolvedZone?.resolved?.text_layout)
    ? resolvedZone.resolved.text_layout
    : undefined;
  const resolvedSourceText =
    typeof textLayout?.source_text === 'string' ? textLayout.source_text : '';
  const resolvedContentBox = readResolvedBox(textLayout?.content_box_px);
  const usesDraftGeometry = draftGeometryZoneIds.has(zone.id);
  const useResolvedTextGeometry =
    isClipMode &&
    zone.type === 'text' &&
    Boolean(resolvedRect) &&
    Boolean(resolvedContentBox) &&
    !usesDraftGeometry;
  const useResolvedGeometry =
    isClipMode && Boolean(resolvedRect) && !usesDraftGeometry && !useResolvedTextGeometry;
  const x = readLengthSpec(
    useResolvedTextGeometry
      ? coerceNumber(resolvedRect?.x, 0) + coerceNumber(resolvedContentBox?.x, 0)
      : useResolvedGeometry
        ? resolvedRect?.x
        : bounds.x,
    coerceNumber(resolvedRect?.x, 0)
  );
  const y = readLengthSpec(
    useResolvedTextGeometry
      ? coerceNumber(resolvedRect?.y, 0) + coerceNumber(resolvedContentBox?.y, 0)
      : useResolvedGeometry
        ? resolvedRect?.y
        : bounds.y,
    coerceNumber(resolvedRect?.y, 0)
  );
  const w = readLengthSpec(
    useResolvedTextGeometry
      ? coerceNumber(resolvedContentBox?.width, coerceNumber(resolvedRect?.w, 0))
      : useResolvedGeometry
        ? resolvedRect?.w
        : bounds.width,
    coerceNumber(resolvedRect?.w, 0)
  );
  const isAutoHeight = !useResolvedGeometry && !useResolvedTextGeometry && bounds.height === undefined;

  const assetKey = zone.asset_ref || zone.id;
  const templateAsset = zone.type === 'image' ? template.assets[assetKey] : undefined;
  const manifestAssetUrl =
    zone.type === 'image' ? activeManifest?.assets?.[assetKey] : undefined;
  const templateAssetProxyUrl =
    zone.type === 'image' && !activeManifest && templateAsset
      ? getTemplateAssetProxyUrl(template.id, assetKey)
      : null;
  const { resolvedUrl: hydratedTemplateAssetUrl, error: protectedAssetError } =
    useProtectedAssetUrl(templateAssetProxyUrl);
  const imageSrc =
    uploadedImages[zone.id] ||
    hydratedTemplateAssetUrl ||
    getAssetPreviewUrl(templateAsset, manifestAssetUrl) ||
    null;

  const contentRef = zone.content_ref || '';
  const previewText = contentRef ? previewTexts[contentRef] : undefined;
  const hasVideoPreview =
    zone.type === 'video' && Boolean(videoSrc) && !suppressMediaContent;
  const isLogoZone = zone.type === 'image' && zone.role === 'logo';
  const derivedTextBackgroundFill =
    isClipMode &&
    zone.type === 'text' &&
    (typeof (resolvedZone?.resolved?.fills as Record<string, unknown> | undefined)?.bg === 'string'
      ? ((resolvedZone?.resolved?.fills as Record<string, unknown>).bg as string)
      : undefined);
  const hasTextBackgroundLayer =
    zone.type === 'text' &&
    (template.zones.some(entry => entry.id === `${zone.id}__bg` && entry.type === 'shape') ||
      Boolean(derivedTextBackgroundFill) ||
      Boolean(zone.style_ref && template.styles[zone.style_ref]?.bg_fill));

  const style = zone.style_ref ? template.styles[zone.style_ref] : undefined;
  const resolvedFills =
    zone.type === 'text'
      ? (resolvedZone?.resolved?.fills as Record<string, unknown> | undefined)
      : undefined;
  let bgColor: string | undefined;
  let textColor: string | undefined;
  let shapeColor: string | undefined;
  if (zone.type === 'text' && style) {
    bgColor =
      style.bg_fill || (typeof resolvedFills?.bg === 'string' ? resolvedFills.bg : undefined);
    textColor =
      style.fill || (typeof resolvedFills?.text === 'string' ? resolvedFills.text : undefined);
  }
  if (zone.type === 'shape' && style) {
    if (zone.role === 'text_background') {
      const pairedFills = resolvedZone?.resolved?.fills as Record<string, unknown> | undefined;
      shapeColor =
        (typeof pairedFills?.bg === 'string' ? pairedFills.bg : undefined) ||
        style.bg_fill ||
        style.fill;
    } else {
      shapeColor = style.fill || style.bg_fill;
    }
  }
  const editableText = typeof previewText === 'string' ? previewText : resolvedSourceText;

  const mediaFit =
    (useResolvedGeometry ? resolvedZone?.resolved?.fit : undefined) ??
    zone.media?.fit ??
    (isRenderedMode ? resolvedZone?.resolved?.fit : undefined) ??
    'cover';
  const cropFocus = normalizeCropFocus(
    (useResolvedGeometry ? resolvedZone?.resolved?.crop_focus : undefined) ??
      zone.media?.crop_focus ??
      (isRenderedMode ? resolvedZone?.resolved?.crop_focus : undefined)
  );
  const mediaObjectPosition = cropFocus
    ? `${Math.round(cropFocus.x * 100)}% ${Math.round(cropFocus.y * 100)}%`
    : cropAnchorToObjectPosition(
        (useResolvedGeometry ? resolvedZone?.resolved?.crop_anchor : undefined) ??
          zone.media?.crop_anchor ??
          (isRenderedMode ? resolvedZone?.resolved?.crop_anchor : undefined)
      );
  const videoAspectRatio =
    zone.type === 'video'
      ? (
          (useResolvedGeometry && resolvedRect?.h
            ? resolvedRect.w / resolvedRect.h
            : undefined) ??
          readBoundsAspectRatio(zone.bounds) ??
          sourceVideoAspectRatio
        )
      : null;

  const h = useMemo(() => {
    if (useResolvedTextGeometry) {
      return coerceNumber(resolvedContentBox?.height, coerceNumber(resolvedRect?.h, w));
    }
    if (useResolvedGeometry) {
      return coerceNumber(resolvedRect?.h, w);
    }
    if (!isAutoHeight) {
      return readLengthSpec(bounds.height, coerceNumber(resolvedRect?.h, w));
    }
    if (zone.type === 'image' && imageAspectRatio && imageAspectRatio > 0) {
      return Math.max(1, Math.round(w / imageAspectRatio));
    }
    return coerceNumber(resolvedRect?.h, w);
  }, [
    bounds.height,
    imageAspectRatio,
    isAutoHeight,
    resolvedContentBox?.height,
    resolvedRect?.h,
    useResolvedGeometry,
    useResolvedTextGeometry,
    w,
    zone.type,
  ]);

  useEffect(() => {
    if (renderMode === 'clip' || activeManifest) return;
    if (!templateAssetProxyUrl) return;
    if (protectedAssetError?.code === 'unauthorized') {
      setAssetPreviewError(PROTECTED_ASSET_AUTH_MESSAGE);
      return;
    }
    if (protectedAssetError) {
      setAssetPreviewError(PROTECTED_ASSET_LOAD_MESSAGE);
      return;
    }
    if (hydratedTemplateAssetUrl) {
      setAssetPreviewError(null);
    }
  }, [
    activeManifest,
    hydratedTemplateAssetUrl,
    protectedAssetError,
    renderMode,
    setAssetPreviewError,
    templateAssetProxyUrl,
  ]);

  const textMetrics = useMemo(() => {
    const liveText = zone.text;
    const fontSizeBase =
      liveText?.font?.size ?? coerceNumber(textLayout?.font_size_used, 40) ?? 40;
    const horizontalAlign = liveText?.horizontal_align ?? textLayout?.horizontal_align;
    const textAlign = horizontalAlignToText(horizontalAlign);
    const resolvedLines = Array.isArray(textLayout?.lines)
      ? textLayout.lines.filter((line): line is string => typeof line === 'string')
      : [];
    const useExactResolvedLines =
      !isEditingText &&
      resolvedLines.length > 0 &&
      editableText === resolvedSourceText;
    const useZoneBoundsAsContentBox =
      isClipMode && zone.type === 'text' && (useResolvedTextGeometry || usesDraftGeometry);
    const paddingXBase = Math.max(12, Math.round(fontSizeBase * 0.24));
    const paddingYBase = Math.max(8, Math.round(fontSizeBase * 0.16));
    const paddingXPx = paddingXBase * scale;
    const paddingYPx = paddingYBase * scale;
    const usableWidth = Math.max(w * scale - paddingXPx * 2, 1);
    const liveWidthPercent = liveText?.width_percent;
    const textWidthPx =
      typeof liveWidthPercent === 'number' && Number.isFinite(liveWidthPercent)
        ? (usableWidth * liveWidthPercent) / 100
        : usableWidth;

    const fontSizePx = fontSizeBase * scale;
    const lineSpacingBase = coerceNumber(
      liveText?.line_spacing_px,
      coerceNumber(textLayout?.line_spacing_px, 0)
    );
    const lineSpacingPx = lineSpacingBase * scale;
    const resolvedLineAdvancePx =
      coerceNumber(textLayout?.line_advance_px, coerceNumber(textLayout?.line_height_px, fontSizeBase)) *
      scale;
    const lineHeightPx = Math.max(fontSizePx, resolvedLineAdvancePx);
    const resolvedLineCount = Math.max(
      1,
      Math.round(coerceNumber(textLayout?.line_count, 1))
    );
    const resolvedBlockHeightPx = Math.max(
      coerceNumber(textLayout?.block_height_px, 0) * scale,
      resolvedLineCount * lineHeightPx + Math.max(0, resolvedLineCount - 1) * lineSpacingPx
    );
    const contentWidthPx = useZoneBoundsAsContentBox
      ? Math.max(w * scale, 1)
      : resolvedContentBox
      ? Math.min(Math.max(resolvedContentBox.width * scale, 1), w * scale)
      : Math.min(Math.max(textWidthPx, 1), usableWidth);
    const contentHeightPx = useZoneBoundsAsContentBox
      ? Math.max(h * scale, lineHeightPx)
      : resolvedContentBox
      ? Math.min(Math.max(resolvedContentBox.height * scale, lineHeightPx), h * scale)
      : Math.max(
          h * scale - paddingYPx * 2,
          resolvedBlockHeightPx
        );
    const contentXPx = useZoneBoundsAsContentBox
      ? 0
      : resolvedContentBox
      ? Math.min(Math.max(resolvedContentBox.x * scale, 0), Math.max(0, w * scale - contentWidthPx))
      : paddingXPx;
    const contentYPx = useZoneBoundsAsContentBox
      ? 0
      : resolvedContentBox
      ? Math.min(Math.max(resolvedContentBox.y * scale, 0), Math.max(0, h * scale - contentHeightPx))
      : paddingYPx;
    const maxLines =
      typeof liveText?.max_lines === 'number' && Number.isFinite(liveText.max_lines)
        ? Math.max(1, liveText.max_lines)
        : Math.max(1, coerceNumber(textLayout?.line_count, 3));
    const allowRenderOverflow =
      useExactResolvedLines &&
      useResolvedTextGeometry &&
      coerceNumber(textLayout?.max_text_width_px, contentWidthPx / scale) * scale >
        contentWidthPx + 0.5;

    return {
      color: textColor || '#000000',
      backgroundColor:
        isClipMode && hasTextBackgroundLayer ? 'transparent' : bgColor || '#FFFFFF',
      fontFamily: liveText?.font?.family || textLayout?.font_family_used || 'sans-serif',
      fontWeight: liveText?.font?.weight ?? coerceNumber(textLayout?.font_weight, 400),
      fontSizePx,
      lineHeightPx,
      lineAdvancePx: lineHeightPx,
      lineSpacingPx,
      editContentXPx: contentXPx,
      editContentYPx: contentYPx,
      editContentWidthPx: contentWidthPx,
      editContentHeightPx: contentHeightPx,
      displayContentXPx: contentXPx,
      displayContentYPx: contentYPx,
      displayContentWidthPx: contentWidthPx,
      displayContentHeightPx: contentHeightPx,
      maxLines,
      paddingXPx,
      paddingYPx,
      usesResolvedContentBox: Boolean(resolvedContentBox) || useZoneBoundsAsContentBox,
      resolvedLines,
      useExactResolvedLines,
      allowRenderOverflow,
      justifyContent: verticalAlignToJustifyContent(
        liveText?.vertical_align ?? textLayout?.vertical_align
      ),
      alignItems: horizontalAlignToItems(
        horizontalAlign
      ),
      textAlign,
    };
  }, [
    bgColor,
      scale,
      textColor,
      textLayout,
      editableText,
      resolvedSourceText,
      h,
      isClipMode,
      isEditingText,
      usesDraftGeometry,
      useResolvedTextGeometry,
      w,
    zone.text?.font?.family,
    zone.text?.font?.size,
    zone.text?.font?.weight,
    zone.text?.horizontal_align,
    zone.text?.line_spacing_px,
    zone.text?.vertical_align,
    zone.text?.width_percent,
  ]);

  const showChrome = isClipMode ? selected : !isRenderedMode || selected;
  const showLabel = !isClipMode && !isRenderedMode && showChrome && !isEditingText;
  const showPlaceholder = !isClipMode && !isRenderedMode;
  const showCropFocusControl =
    (isRenderedMode || isClipMode) &&
    selected &&
    zone.type === 'video' &&
    mediaFit === 'cover' &&
    !locked;
  const showImageSkeleton =
    zone.type === 'image' && (assetResolving || (Boolean(imageSrc) && imageLoading));
  const showVideoSkeleton =
    zone.type === 'video' && hasVideoPreview && videoLoading && !videoLoadFailed;
  const showImageUnavailable =
    zone.type === 'image' &&
    assetFailed &&
    !showImageSkeleton &&
    (!imageSrc || imageLoadFailed);
  const loadingTestId = `zone-loading-${zone.id}`;

  useEffect(() => {
    if (interactionState) return;
    setLiveRect({
      x: x * scale,
      y: y * scale,
      width: w * scale,
      height: h * scale,
    });
  }, [h, interactionState, scale, w, x, y]);

  useEffect(() => {
    liveRectRef.current = liveRect;
  }, [liveRect]);

  useEffect(() => {
    return () => {
      if (liveRectFrameRef.current !== null) {
        window.cancelAnimationFrame(liveRectFrameRef.current);
      }
    };
  }, []);

  const scheduleLiveRect = (nextRect: RectState) => {
    liveRectRef.current = nextRect;
    pendingLiveRectRef.current = nextRect;

    if (liveRectFrameRef.current !== null) return;

    liveRectFrameRef.current = window.requestAnimationFrame(() => {
      liveRectFrameRef.current = null;
      const pendingRect = pendingLiveRectRef.current;
      if (!pendingRect) return;
      pendingLiveRectRef.current = null;
      setLiveRect(pendingRect);
    });
  };

  useEffect(() => {
    if (zone.type !== 'image' || !imageSrc) {
      setImageAspectRatio(null);
      setImageLoadFailed(false);
      setImageLoading(assetResolving);
      return;
    }

    let cancelled = false;
    setImageLoading(true);
    const image = new window.Image();
    image.onload = () => {
      if (!cancelled && image.naturalWidth > 0 && image.naturalHeight > 0) {
        setImageAspectRatio(image.naturalWidth / image.naturalHeight);
        setImageLoadFailed(false);
        setImageLoading(false);
      }
    };
    image.onerror = () => {
      if (!cancelled) {
        setImageAspectRatio(null);
        setImageLoadFailed(true);
        setImageLoading(false);
      }
    };
    image.src = imageSrc;

    return () => {
      cancelled = true;
    };
  }, [assetResolving, imageSrc, zone.type]);

  useEffect(() => {
    if (zone.type !== 'video' || !hasVideoPreview) {
      setVideoLoading(false);
      setVideoLoadFailed(false);
      return;
    }

    setVideoLoading(true);
    setVideoLoadFailed(false);
  }, [hasVideoPreview, videoSrc, zone.type]);

  useEffect(() => {
    if (!hasVideoPreview || !videoRef.current) return;

    const element = videoRef.current;
    if (Math.abs(element.currentTime - currentTime) > 0.15) {
      try {
        element.currentTime = currentTime;
      } catch {
        // Ignore seek jitter while metadata is still loading.
      }
    }
  }, [currentTime, hasVideoPreview]);

  useEffect(() => {
    if (!hasVideoPreview || !videoRef.current) return;

    const element = videoRef.current;
    if (isPlaying) {
      void element.play().catch(() => {
        // Ignore autoplay/promise failures; the master transport owns playback state.
      });
    } else {
      element.pause();
    }
  }, [hasVideoPreview, isPlaying]);

  useEffect(() => {
    if (!isEditingText || !textEditorRef.current) return;

    const frame = window.requestAnimationFrame(() => {
      const input = textEditorRef.current;
      if (!input) return;
      input.focus();
      const caretPosition = input.value.length;
      input.setSelectionRange(caretPosition, caretPosition);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isEditingText, zone.id]);

  useEffect(() => {
    if (!isEditingText || !textEditorRef.current) return;

    const input = textEditorRef.current;
    input.style.height = '0px';
    const maxEditableHeight = Math.max(
      textMetrics.editContentHeightPx,
      h * scale - textMetrics.editContentYPx
    );
    const nextHeight = Math.min(
      Math.max(input.scrollHeight, textMetrics.editContentHeightPx),
      maxEditableHeight
    );
    input.style.height = `${Math.max(nextHeight, textMetrics.fontSizePx)}px`;
  }, [
    editableText,
    h,
    isEditingText,
    scale,
    textMetrics.editContentHeightPx,
    textMetrics.editContentYPx,
    textMetrics.fontSizePx,
  ]);

  const handleTextDoubleClick = (event: React.MouseEvent) => {
    if (renderMode === 'rendered' || zone.type !== 'text' || !contentRef) return;
    event.stopPropagation();
    beginTextEditing(zone.id);
  };

  const handleTextChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!contentRef) return;
    setPreviewText(contentRef, event.target.value);
  };

  const handleTextEditorKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      endTextEditing(true);
    }
  };

  const patchCropFocus = (nextFocus: { x: number; y: number }) => {
    updateZone(zone.id, {
      media: {
        fit: zone.media?.fit ?? 'cover',
        crop_anchor: zone.media?.crop_anchor ?? 'center',
        ...zone.media,
        crop_focus: nextFocus,
      },
    });
  };

  const handleCropFocusPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!showCropFocusControl) return;

    event.preventDefault();
    event.stopPropagation();

    const fillElement = event.currentTarget.parentElement;
    if (!fillElement) return;

    const updateFromPoint = (clientX: number, clientY: number) => {
      const rect = fillElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      patchCropFocus({
        x: Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1),
        y: Math.min(Math.max((clientY - rect.top) / rect.height, 0), 1),
      });
    };

    updateFromPoint(event.clientX, event.clientY);

    const onMove = (moveEvent: PointerEvent) => {
      updateFromPoint(moveEvent.clientX, moveEvent.clientY);
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  };

  const resizeHandles =
    !locked && !isEditingText && !isRenderedMode
      ? {
          top: true,
          right: true,
          bottom: true,
          left: true,
          topRight: true,
          bottomRight: true,
          bottomLeft: true,
          topLeft: true,
        }
      : false;

  const nonInteractiveBackground =
    isClipMode && zone.type === 'shape' && zone.role === 'text_background';

  const commitRect = (nextRect: RectState, mode: 'move' | 'resize' | null = null) => {
    const update: Record<string, number> = {
      x: Math.round(nextRect.x / scale),
      y: Math.round(nextRect.y / scale),
    };
    const includeSize = !(zone.type === 'video' && mode === 'move');
    if (includeSize) {
      update.width = Math.round(nextRect.width / scale);
      if (!isAutoHeight || zone.type !== 'image') {
        update.height = Math.round(nextRect.height / scale);
      }
    }
    updateZoneBounds(zone.id, update);
  };

  const clipResizeHandles: ResizeDirection[] = [
    'topLeft',
    'top',
    'topRight',
    'right',
    'bottomRight',
    'bottom',
    'bottomLeft',
    'left',
  ];

  const startPointerSession = (
    event: React.PointerEvent<HTMLElement>,
    mode: 'move' | 'resize',
    direction?: ResizeDirection
  ) => {
    if (isRenderedMode || locked || isEditingText || nonInteractiveBackground) return;
    if (event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();
    selectZone(zone.id);

    pointerSessionRef.current = {
      pointerId: event.pointerId,
      mode,
      direction,
      startX: event.clientX,
      startY: event.clientY,
      origin: liveRectRef.current,
      moved: false,
    };
    setInteractionState(mode === 'move' ? 'drag' : 'resize');
  };

  useEffect(() => {
    if (isRenderedMode) return undefined;

    const handlePointerMove = (event: PointerEvent) => {
      const session = pointerSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;

      const deltaX = event.clientX - session.startX;
      const deltaY = event.clientY - session.startY;
      const moved = Math.abs(deltaX) + Math.abs(deltaY) > 2;
      session.moved = session.moved || moved;
      suppressNextClickRef.current = session.moved;

      if (session.mode === 'move') {
        const nextRect = {
          x: session.origin.x + deltaX,
          y: session.origin.y + deltaY,
          width: session.origin.width,
          height: session.origin.height,
        };
        scheduleLiveRect(
          zone.type === 'video'
            ? clampVideoRectPosition(nextRect, {
                width: template.canvas.width * scale,
                height: template.canvas.height * scale,
              })
            : nextRect
        );
        return;
      }

      const nextRect = resizeRect(
        session.origin,
        session.direction || 'bottomRight',
        deltaX,
        deltaY,
        zone.type === 'image'
          ? imageAspectRatio
          : zone.type === 'video'
            ? videoAspectRatio
            : null
      );
      scheduleLiveRect(
        zone.type === 'video'
          ? normalizeVideoRect(
              nextRect,
              {
                width: template.canvas.width * scale,
                height: template.canvas.height * scale,
              },
              videoAspectRatio
            )
          : nextRect
      );
    };

    const handlePointerUp = (event: PointerEvent) => {
      const session = pointerSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;

      pointerSessionRef.current = null;
      setInteractionState(null);
      if (session.moved) {
        commitRect(liveRectRef.current, session.mode);
      }
      window.setTimeout(() => {
        suppressNextClickRef.current = false;
      }, 0);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [
    commitRect,
    imageAspectRatio,
    isRenderedMode,
    scale,
    template.canvas.height,
    template.canvas.width,
    videoAspectRatio,
    zone.type,
  ]);

  const layerContent = (
    <div
      className={`zone-renderer__fill zone-renderer__fill--${zone.type}${isLogoZone ? ' zone-renderer__fill--logo' : ''} zone-renderer__drag-surface`}
      style={{
        ...(!isRenderedMode && !isClipMode && bgColor
          ? { background: `${bgColor}22`, borderColor: `${bgColor}55` }
          : undefined),
        ...(zone.type === 'text' && textMetrics.allowRenderOverflow
          ? { overflow: 'visible' as const }
          : undefined),
      }}
    >
      {!suppressMediaContent && hasVideoPreview ? (
        <>
          {showVideoSkeleton && (
            <div className="zone-renderer__loading" data-testid={loadingTestId}>
              <Skeleton className="zone-renderer__loading-skeleton" />
            </div>
          )}
          <video
            ref={videoRef}
            src={videoSrc || undefined}
            className="zone-renderer__video"
            muted
            playsInline
            preload="metadata"
            style={{ objectFit: mediaFit, objectPosition: mediaObjectPosition }}
            onLoadedMetadata={() => {
              setVideoLoading(false);
              setVideoLoadFailed(false);
            }}
            onCanPlay={() => {
              setVideoLoading(false);
              setVideoLoadFailed(false);
            }}
            onError={() => {
              setVideoLoading(false);
              setVideoLoadFailed(true);
            }}
          />
        </>
      ) : !suppressMediaContent && zone.type === 'image' && imageSrc && !imageLoadFailed ? (
        <>
          {showImageSkeleton && (
            <div className="zone-renderer__loading" data-testid={loadingTestId}>
              <Skeleton className="zone-renderer__loading-skeleton" />
            </div>
          )}
          <img
            src={imageSrc}
            alt={zone.id}
            className={`zone-renderer__uploaded-img${isLogoZone ? ' zone-renderer__uploaded-img--logo' : ''}`}
            style={{ objectFit: mediaFit, objectPosition: mediaObjectPosition }}
            onLoad={() => {
              setImageLoadFailed(false);
              setImageLoading(false);
            }}
            onError={() => {
              setImageLoadFailed(true);
              setImageLoading(false);
            }}
            draggable={false}
          />
        </>
      ) : !suppressMediaContent && zone.type === 'image' && showImageSkeleton ? (
        <div className="zone-renderer__loading" data-testid={loadingTestId}>
          <Skeleton className="zone-renderer__loading-skeleton" />
        </div>
      ) : !suppressMediaContent && showImageUnavailable ? (
        <div
          className="zone-renderer__unavailable"
          data-testid={`zone-unavailable-${zone.id}`}
        >
          <ImageIcon
            size={20}
            className="zone-renderer__type-icon"
            style={{ opacity: 0.45 }}
          />
          <span>Logo unavailable</span>
        </div>
      ) : zone.type === 'shape' ? (
        <div
          className="zone-renderer__shape"
          style={{ backgroundColor: shapeColor || '#FFFFFF' }}
        />
      ) : zone.type === 'text' ? (
        <div
          className={`zone-renderer__text-render ${isEditingText ? 'zone-renderer__text-render--editing' : ''}`}
          style={{
            backgroundColor: textMetrics.backgroundColor,
            justifyContent: textMetrics.usesResolvedContentBox
              ? undefined
              : textMetrics.justifyContent,
            alignItems: textMetrics.usesResolvedContentBox
              ? undefined
              : textMetrics.alignItems,
            padding: textMetrics.usesResolvedContentBox
              ? '0px'
              : `${textMetrics.paddingYPx}px ${textMetrics.paddingXPx}px`,
            pointerEvents: isEditingText ? 'auto' : 'none',
          }}
        >
          {isEditingText ? (
            <textarea
              ref={textEditorRef}
              className="zone-renderer__text-editor"
              value={editableText}
              onChange={handleTextChange}
              onBlur={() => endTextEditing(true)}
              onKeyDown={handleTextEditorKeyDown}
              onPointerDown={event => event.stopPropagation()}
              onClick={event => event.stopPropagation()}
              spellCheck={false}
              style={{
                position: textMetrics.usesResolvedContentBox ? 'absolute' : 'relative',
                left: textMetrics.usesResolvedContentBox ? `${textMetrics.editContentXPx}px` : undefined,
                top: textMetrics.usesResolvedContentBox ? `${textMetrics.editContentYPx}px` : undefined,
                width: `${textMetrics.editContentWidthPx}px`,
                minHeight: `${textMetrics.editContentHeightPx}px`,
                color: textMetrics.color,
                fontFamily: textMetrics.fontFamily,
                fontWeight: textMetrics.fontWeight,
                fontSize: `${textMetrics.fontSizePx}px`,
                lineHeight: `${textMetrics.lineHeightPx}px`,
                textAlign: textMetrics.textAlign,
              }}
            />
          ) : (
            <div
              className="zone-renderer__text-block"
              style={{
                position: textMetrics.usesResolvedContentBox ? 'absolute' : 'relative',
                left: textMetrics.usesResolvedContentBox ? `${textMetrics.displayContentXPx}px` : undefined,
                top: textMetrics.usesResolvedContentBox ? `${textMetrics.displayContentYPx}px` : undefined,
                width: `${textMetrics.displayContentWidthPx}px`,
                minHeight: `${textMetrics.displayContentHeightPx}px`,
                color: textMetrics.color,
                fontFamily: textMetrics.fontFamily,
                fontWeight: textMetrics.fontWeight,
                fontSize: `${textMetrics.fontSizePx}px`,
                lineHeight: `${textMetrics.lineHeightPx}px`,
                textAlign: textMetrics.textAlign,
              }}
            >
              <div
                className="zone-renderer__text-live"
                style={{
                  display: 'block',
                  overflow: 'visible',
                  wordBreak: 'break-word',
                  overflowWrap: 'anywhere',
                }}
              >
                {textMetrics.useExactResolvedLines
                  ? textMetrics.resolvedLines.map((line, index) => (
                      <div
                        key={`${zone.id}-line-${index}`}
                        className="zone-renderer__text-line"
                        style={{
                          whiteSpace: 'pre',
                          wordBreak: 'keep-all',
                          overflowWrap: 'normal',
                        }}
                      >
                        {line || '\u00A0'}
                      </div>
                    ))
                  : editableText}
              </div>
            </div>
          )}
        </div>
      ) : !suppressMediaContent && showPlaceholder ? (
        <>
          {zone.type === 'video' && (
            <Film size={24} className="zone-renderer__type-icon" />
          )}
          {zone.type === 'image' && (
            <ImageIcon
              size={20}
              className="zone-renderer__type-icon"
              style={{ opacity: 0.4 }}
            />
          )}
        </>
      ) : null}
      {showCropFocusControl && cropFocus && (
        <>
          <button
            type="button"
            className="zone-renderer__crop-handle"
            style={{
              left: `${cropFocus.x * 100}%`,
              top: `${cropFocus.y * 100}%`,
            }}
            onPointerDown={handleCropFocusPointerDown}
            onClick={event => event.stopPropagation()}
            aria-label="Adjust crop focus"
          />
          <button
            type="button"
            className="zone-renderer__crop-reset"
            onClick={event => {
              event.preventDefault();
              event.stopPropagation();
              patchCropFocus({ x: 0.5, y: 0.5 });
            }}
          >
            Reset crop
          </button>
        </>
      )}
      {showLabel && (
        <span className={`zone-renderer__label zone-renderer__label--${zone.type}`}>
          {zone.id}
          {zone.role && <span className="zone-renderer__role">{zone.role}</span>}
          {isAutoHeight && <span className="zone-renderer__auto-badge">auto-h</span>}
          {locked && <Lock size={10} style={{ marginLeft: 4 }} />}
        </span>
      )}
    </div>
  );

  return (
    <div
      data-testid={`zone-${zone.id}`}
      data-zone-id={zone.id}
      className={`zone-renderer ${selected ? 'zone-renderer--selected' : ''} ${locked ? 'zone-renderer--locked' : ''} ${isRenderedMode ? 'zone-renderer--rendered' : isClipMode ? 'zone-renderer--clip' : 'zone-renderer--editor'}`}
      style={{
        left: liveRect.x,
        top: liveRect.y,
        width: liveRect.width,
        height: liveRect.height,
        zIndex: zone.z,
        pointerEvents: nonInteractiveBackground ? 'none' : 'auto',
      }}
      onPointerDown={event => {
        if (nonInteractiveBackground || isRenderedMode) return;
        const target = event.target as HTMLElement | null;
        if (
          target?.closest('.zone-renderer__handle') ||
          target?.closest('.zone-renderer__text-editor') ||
          target?.closest('.zone-renderer__crop-handle') ||
          target?.closest('.zone-renderer__crop-reset')
        ) {
          return;
        }
        startPointerSession(event, 'move');
      }}
      onClick={(event: React.MouseEvent) => {
        if (nonInteractiveBackground) return;
        if (suppressNextClickRef.current) {
          suppressNextClickRef.current = false;
          return;
        }
        event.stopPropagation();
        if (isEditingText) return;
        selectZone(zone.id);
      }}
      onDoubleClick={handleTextDoubleClick}
    >
      {layerContent}
      {selected &&
        resizeHandles &&
        clipResizeHandles.map(direction => (
          <button
            key={direction}
            type="button"
            data-testid={`zone-handle-${zone.id}-${direction}`}
            className={`zone-renderer__handle zone-renderer__handle--${direction}`}
            onPointerDown={event => startPointerSession(event, 'resize', direction)}
            onClick={event => event.stopPropagation()}
            aria-label={`Resize ${direction}`}
          />
        ))}
    </div>
  );
}
