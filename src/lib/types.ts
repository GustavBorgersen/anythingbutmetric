export interface Unit {
  id: string;
  label: string;
  emoji?: string;
  aliases?: string[];
  tags?: string[];
}

export interface Edge {
  id: string;
  from: string;
  to: string;
  factor: number;
  source_url: string;
  source_quote: string;
  date_scraped: string;
  verified: boolean;
}

export interface Step {
  fromId: string;
  toId: string;
  factor: number;
  edges: Edge[];
}

export interface Route {
  routeIndex: number;
  label: string;
  result: number;
  nodeIds: string[];
  edgeIds: string[];
  steps: Step[];
}

export interface ConvertRequest {
  from: string;
  to: string;
  quantity: number;
  mode?: "seed" | "live";
}

export interface GraphData {
  nodes: Unit[];
  links: Edge[];
}

export interface HighlightState {
  nodeIds: string[];
  edgeIds: string[];
  routeIndex: number;
}
