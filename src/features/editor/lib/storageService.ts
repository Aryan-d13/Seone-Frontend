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
    /** Public download URL for preview. */
    downloadUrl: string;
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
            if (!ctx) { reject(new Error('No canvas context')); return; }
            ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

            canvas.toBlob((blob) => {
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
    _filename: string,
    file: File | Blob,
): Promise<UploadResult> {
    // Resize logo to 200px width, auto height
    const resized = await resizeImage(file, 200);

    // Always use standardized filename "logo.png"
    const blobPath = `templates/${templateDocId}/assets/logo.png`;

    // Build the full upload URL from the SAS base URL
    const sasUrl = process.env.NEXT_PUBLIC_AZURE_SAS_URL;
    if (!sasUrl) {
        throw new Error('NEXT_PUBLIC_AZURE_SAS_URL is not configured. Cannot upload to Azure Blob Storage.');
    }

    // SAS URL format: https://<account>.blob.core.windows.net/<container>?<sas_token>
    // We need to insert the blob path before the query string
    const [baseUrl, sasToken] = sasUrl.split('?');
    const uploadUrl = `${baseUrl}/${blobPath}?${sasToken}`;

    // Upload via PUT with x-ms-blob-type header (Azure Blob REST API)
    const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
            'x-ms-blob-type': 'BlockBlob',
            'Content-Type': 'image/png',
        },
        body: resized,
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Azure upload failed (${response.status}): ${errorText}`);
    }

    // Construct the public download URL (without SAS token for storage in Firestore)
    const downloadUrl = `${baseUrl}/${blobPath}`;

    return { azureBlobPath: blobPath, downloadUrl };
}
