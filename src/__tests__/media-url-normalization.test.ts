import { getMediaUrl } from '@/lib/config';

describe('getMediaUrl', () => {
  it('returns absolute HTTPS URLs as-is', () => {
    const absoluteUrl = 'https://storage.googleapis.com/seone-assets/jobs/abc/clip_0.mp4';
    expect(getMediaUrl(absoluteUrl)).toBe(absoluteUrl);
  });

  it('returns protocol-relative URLs as-is', () => {
    const protocolRelative = '//cdn.example.com/clip_0.mp4';
    expect(getMediaUrl(protocolRelative)).toBe(protocolRelative);
  });

  it('prepends data base URL for relative clip paths', () => {
    expect(getMediaUrl('/clips/clip_0.mp4')).toBe(
      'http://localhost:8000/data/clips/clip_0.mp4'
    );
  });

  it('avoids duplicating /data prefix', () => {
    expect(getMediaUrl('/data/clips/clip_0.mp4')).toBe(
      'http://localhost:8000/data/clips/clip_0.mp4'
    );
  });
});
