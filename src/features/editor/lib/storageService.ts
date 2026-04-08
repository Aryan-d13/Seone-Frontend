/**
 * Template asset upload — proxied through the backend API.
 *
 * Uploads logo images via POST /admin/templates/{doc_id}/assets/{asset_key}.
 * The backend handles Azure auth (connection string), Pillow resize, and SAS signing.
 * No client-side SAS token or NEXT_PUBLIC_AZURE_SAS_URL needed.
 */

import { authFetch } from '@/services/auth';
import { endpoints } from '@/lib/config';

export interface UploadResult {
  /** Azure Blob path (relative to container root). */
  azureBlobPath: string;
  /** Canonical storage URI persisted in template metadata. */
  sourceUri: string;
  /** Public download URL for preview. */
  downloadUrl: string;
}

export type AzureTemplateAssetType = 'image' | 'font';

interface UploadAssetOptions {
  assetType?: AzureTemplateAssetType;
  assetKey?: string;
}

/**
 * Upload is always available — proxied through the backend.
 * Kept for API compat with callers that still check before uploading.
 */
export function isAzureAssetUploadConfigured(): boolean {
  return true;
}

/**
 * Resize an image to a fixed width (default 200px) while preserving aspect ratio.
 * Returns a Blob of the resized image.
 */
export function resizeImage(file: File | Blob, targetWidth = 200): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const ratio = img.height / img.width;
      const targetHeight = Math.round(targetWidth * ratio);

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('No canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob failed'));
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image load failed'));
    };
    img.src = url;
  });
}

/**
 * Validate that an image is square (1:1 aspect ratio).
 * Tolerates up to 5% deviation.
 */
function validateSquareImage(file: File | Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const ratio = img.width / img.height;
      if (ratio < 0.95 || ratio > 1.05) {
        reject(
          new Error(
            `Logo must be square (1:1). Uploaded image is ${img.width}×${img.height}px. Please crop or resize to a square before uploading.`
          )
        );
        return;
      }
      resolve();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image dimensions.'));
    };
    img.src = url;
  });
}

/**
 * Upload an asset file via the backend proxy.
 * The backend handles Azure storage, resize, and signed URL generation.
 *
 * @param templateDocId - Firestore document ID, e.g. "chaturnath_v1"
 * @param filename - Original filename
 * @param file - The File or Blob to upload
 */
export async function uploadAssetToAzure(
  templateDocId: string,
  filename: string,
  file: File | Blob,
  options: UploadAssetOptions = {}
): Promise<UploadResult> {
  const assetType = options.assetType || 'image';
  const assetKey = options.assetKey || filename.replace(/\.[^.]+$/, '') || 'logo_mark';

  // Enforce 1:1 aspect ratio for image uploads (logos)
  if (assetType === 'image') {
    await validateSquareImage(file);
  }

  // Resize images client-side for a faster upload (backend also resizes as fallback)
  const payload = assetType === 'image' ? await resizeImage(file, 200) : file;
  const contentType =
    assetType === 'image' ? 'image/png' : file.type || 'application/octet-stream';

  const endpoint = endpoints.pages.adminTemplateAsset(templateDocId, assetKey);

  const response = await authFetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
    },
    body: payload,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Upload failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  return {
    azureBlobPath: data.blob_path,
    sourceUri: data.source_uri,
    downloadUrl: data.download_url,
  };
}
