/**
 * Azure Blob Storage upload for template assets.
 *
 * Uploads logo images to Azure Blob Storage (seone-data container).
 * Path convention matches the worker's firestore_resolver.py:
 *   templates/{template_doc_id}/assets/logo.png
 *
 * The render worker's firestore_resolver.py downloads via:
 *   BlobServiceClient → container_client.get_blob_client(blob_path).download_blob()
 */

export interface UploadResult {
  /** Azure Blob path (relative to container root). */
  azureBlobPath: string;
  /** Canonical storage URI persisted in template metadata. */
  sourceUri: string;
  /** Public download URL for preview. */
  downloadUrl: string;
}

export const AZURE_UPLOAD_NOT_CONFIGURED_MESSAGE =
  'Logo upload is not configured in this environment.';

export type AzureTemplateAssetType = 'image' | 'font';

interface UploadAssetOptions {
  assetType?: AzureTemplateAssetType;
  assetKey?: string;
}

export function isAzureAssetUploadConfigured(): boolean {
  const sasUrl = process.env.NEXT_PUBLIC_AZURE_SAS_URL;
  return typeof sasUrl === 'string' && sasUrl.trim().length > 0;
}

function sanitizeSegment(value: string, fallback: string): string {
  const cleaned = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || fallback;
}

function inferFontContentType(fileName: string): string {
  const normalized = fileName.toLowerCase();
  if (normalized.endsWith('.otf')) return 'font/otf';
  return 'font/ttf';
}

function buildTemplateBlobPath(
  templateDocId: string,
  filename: string,
  options: UploadAssetOptions
): string {
  const assetType = options.assetType || 'image';
  const safeDocId = sanitizeSegment(templateDocId, 'template');

  if (assetType === 'font') {
    const safeFileName = sanitizeSegment(filename, 'custom-font.ttf');
    return `templates/${safeDocId}/fonts/${safeFileName}`;
  }

  const safeAssetKey = sanitizeSegment(
    options.assetKey || filename.replace(/\.[^.]+$/, ''),
    'asset'
  );
  return `templates/${safeDocId}/assets/${safeAssetKey}.png`;
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
 * Upload an asset file to Azure Blob Storage via SAS URL.
 * Resizes logos to 200px width before upload.
 *
 * @param templateDocId - Firestore document ID, e.g. "chaturnath_v1"
 * @param _filename - Original filename (unused, we standardize to logo.png)
 * @param file - The File or Blob to upload
 */
export async function uploadAssetToAzure(
  templateDocId: string,
  filename: string,
  file: File | Blob,
  options: UploadAssetOptions = {}
): Promise<UploadResult> {
  const assetType = options.assetType || 'image';
  const payload = assetType === 'image' ? await resizeImage(file, 200) : file;
  const contentType =
    assetType === 'image' ? 'image/png' : inferFontContentType(filename);
  const blobPath = buildTemplateBlobPath(templateDocId, filename, options);

  const sasUrl = process.env.NEXT_PUBLIC_AZURE_SAS_URL;
  if (!isAzureAssetUploadConfigured() || !sasUrl) {
    throw new Error(AZURE_UPLOAD_NOT_CONFIGURED_MESSAGE);
  }

  const [baseUrl, sasToken] = sasUrl.split('?');
  const uploadUrl = `${baseUrl}/${blobPath}?${sasToken}`;

  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'x-ms-blob-type': 'BlockBlob',
      'Content-Type': contentType,
    },
    body: payload,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Azure upload failed (${response.status}): ${errorText}`);
  }

  const downloadUrl = `${baseUrl}/${blobPath}`;

  return {
    azureBlobPath: blobPath,
    sourceUri: `azure://seone-data/${blobPath}`,
    downloadUrl,
  };
}
