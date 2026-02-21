import dynamic from "next/dynamic";
import type { Unit, Edge, HighlightState } from "@/lib/types";

const GraphCanvasInner = dynamic(() => import("./GraphCanvasInner"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center text-zinc-600 text-sm">
      Loading graph…
    </div>
  ),
});

interface Props {
  units: Unit[];
  edges: Edge[];
  highlights: HighlightState[];
}

export default function GraphCanvas(props: Props) {
  return <GraphCanvasInner {...props} />;
}
