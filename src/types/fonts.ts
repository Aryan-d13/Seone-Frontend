export interface FontCatalogFile {
  style: string;
  weights: number[];
  filename: string;
  preview_url?: string | null;
}

export type FontAnalysisState = 'ready' | 'pending' | 'failed';

export interface FontAssetAnalysis {
  scripts: string[];
  state: FontAnalysisState;
  error?: string | null;
}

export interface FontCatalogEntry {
  family: string;
  display: string;
  weights: number[];
  scripts: string[];
  source: 'builtin' | 'uploaded' | string;
  assetKey?: string;
  files?: FontCatalogFile[];
  analysisState?: FontAnalysisState;
}

export interface FontCatalogResponse {
  fonts: FontCatalogEntry[];
  total: number;
}
