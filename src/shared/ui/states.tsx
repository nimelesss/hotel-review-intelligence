import { Card } from "@/shared/ui/card";

export function LoadingState({ label }: { label: string }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-5">
        <div className="h-3 w-24 rounded-full bg-panelStrong anim-shimmer" />
        <div className="space-y-2.5">
          <div className="h-4 w-full rounded-full bg-panelStrong anim-shimmer" />
          <div className="h-4 w-5/6 rounded-full bg-panelStrong anim-shimmer" />
          <div className="h-4 w-3/5 rounded-full bg-panelStrong anim-shimmer" />
        </div>
        <p className="text-sm leading-6 text-textMuted">{label}</p>
      </div>
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
    <Card className="glass-panel overflow-hidden">
      <div className="max-w-xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-textMuted">Пока нечего показывать</p>
        <h3 className="mt-3 text-2xl font-semibold text-text">{title}</h3>
        <p className="mt-3 text-sm leading-7 text-textMuted">{description}</p>
      </div>
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
    <Card className="border-rose-500/18 bg-rose-500/8">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-danger">Требуется внимание</p>
      <h3 className="mt-3 text-2xl font-semibold text-danger">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-textMuted">{description}</p>
    </Card>
  );
}


