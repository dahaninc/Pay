export function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="card p-4">
      <p className="section-label !text-[10.5px]">{label}</p>
      <p className="font-disp font-bold text-[26px] text-ink tnum mt-1.5">{value}</p>
      {sub && <p className="text-[12px] font-medium text-muted mt-0.5">{sub}</p>}
    </div>
  );
}
