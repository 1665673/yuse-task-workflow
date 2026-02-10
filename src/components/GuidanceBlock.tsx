import type { Guidance } from "@/lib/types";

interface GuidanceBlockProps {
  guidance: Guidance;
  label?: string;
}

export function GuidanceBlock({ guidance, label }: GuidanceBlockProps) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      {label && (
        <p className="mb-1 text-sm font-medium text-amber-800">{label}</p>
      )}
      <p className="text-sm text-amber-900">{guidance.purpose}</p>
      <p className="mt-1 text-sm text-amber-800">{guidance.description}</p>
    </div>
  );
}
