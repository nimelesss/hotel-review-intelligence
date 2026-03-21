import { Card } from "@/shared/ui/card";

export function LoadingState({ label }: { label: string }) {
  return (
    <Card className="animate-pulse">
      <div className="h-5 w-40 rounded bg-slate-200" />
      <div className="mt-3 space-y-2">
        <div className="h-4 w-full rounded bg-slate-200" />
        <div className="h-4 w-5/6 rounded bg-slate-200" />
        <div className="h-4 w-4/6 rounded bg-slate-200" />
      </div>
      <p className="mt-3 text-sm text-textMuted">{label}</p>
    </Card>
  );
}

export function EmptyState({
  title,
  description
}: {
  title: string;
  description: string;
}) {
  return (
    <Card>
      <h3 className="text-lg font-semibold text-text">{title}</h3>
      <p className="mt-2 text-sm text-textMuted">{description}</p>
    </Card>
  );
}

export function ErrorState({
  title,
  description
}: {
  title: string;
  description: string;
}) {
  return (
    <Card className="border-red-200 bg-red-50">
      <h3 className="text-lg font-semibold text-danger">{title}</h3>
      <p className="mt-2 text-sm text-red-700">{description}</p>
    </Card>
  );
}
