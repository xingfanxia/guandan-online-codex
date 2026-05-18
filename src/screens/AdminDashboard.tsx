import type { LatencyAggregateDto, ReportRecordDto } from '../lib/api/moderation';

export interface AdminDashboardProps {
  reports: ReportRecordDto[];
  latencyAggregates?: LatencyAggregateDto[];
  onBan: (handle: string) => void | Promise<void>;
  onResetStats: (handle: string) => void | Promise<void>;
}

export function AdminDashboard({
  reports,
  latencyAggregates = [],
  onBan,
  onResetStats,
}: AdminDashboardProps): React.ReactElement {
  return (
    <section className="gdo-room-panel gdo-admin" aria-label="Admin dashboard">
      <div className="gdo-room-panel__header">
        <span className="gdo-room-panel__eyebrow">ADMIN</span>
        <strong>Reports</strong>
      </div>
      <div className="gdo-admin__reports">
        {reports.map((report) => (
          <article className="gdo-admin-row" key={report.id}>
            <div className="gdo-admin-row__main">
              <strong>@{report.targetHandle}</strong>
              <span>{report.gameId}</span>
            </div>
            <span className="gdo-admin-row__reason">{report.reason}</span>
            <button className="gdo-command" type="button" aria-label={`封禁 ${report.targetHandle}`} onClick={() => onBan(report.targetHandle)}>
              封禁
            </button>
            <button className="gdo-command" type="button" aria-label={`重置 ${report.targetHandle}`} onClick={() => onResetStats(report.targetHandle)}>
              重置
            </button>
          </article>
        ))}
      </div>
      <div className="gdo-admin-section">
        <div className="gdo-room-panel__header">
          <span className="gdo-room-panel__eyebrow">TELEMETRY</span>
          <strong>Latency</strong>
        </div>
        <div className="gdo-admin-latency" aria-label="Latency aggregates">
          {latencyAggregates.length === 0 ? (
            <span className="gdo-admin-empty">No latency samples yet</span>
          ) : latencyAggregates.map((aggregate) => (
            <article className="gdo-admin-latency-row" key={`${aggregate.route}:${aggregate.region}`}>
              <div className="gdo-admin-row__main">
                <strong>{aggregate.route}</strong>
                <span>{aggregate.count} samples</span>
              </div>
              <strong>{aggregate.region}</strong>
              <span>p50 {aggregate.p50}ms</span>
              <span>p95 {aggregate.p95}ms</span>
              <span>p99 {aggregate.p99}ms</span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
