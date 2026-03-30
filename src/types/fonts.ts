export interface FontCatalogEntry {
  family: string;
  display: string;
  weights: number[];
  scripts: string[];
  source: 'builtin' | 'uploaded' | string;
  assetKey?: string;
}

export interface FontCatalogResponse {
  fonts: FontCatalogEntry[];
  total: number;
}
