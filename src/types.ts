export type FeatureStatus = 'not_started' | 'in_progress' | 'done' | 'blocked';

export interface Feature {
  id: string;
  title: string;
  description: string;
  status: FeatureStatus;
  phaseId: string;     // exactly one phase
  tags: string[];
  order: number;       // manual ordering
  createdAt: number;
  updatedAt: number;
}

export interface Phase {
  id: string;
  name: string;
  order: number;
}

export interface WorkbenchDoc {
  version: number;
  title: string;
  phases: Phase[];
  features: Feature[];
  // later: prd, blogPosts, etc.
}
