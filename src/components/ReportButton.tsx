import { useState } from 'react';
import type { ReportReason } from '../lib/api/moderation';

export interface ReportButtonProps {
  reporterHandle: string;
  targetHandle: string;
  gameId: string;
  onReport: (input: {
    reporterHandle: string;
    targetHandle: string;
    gameId: string;
    reason: ReportReason;
  }) => void;
}

export function ReportButton({
  reporterHandle,
  targetHandle,
  gameId,
  onReport,
}: ReportButtonProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>('cheat');

  if (!open) {
    return (
      <button className="gdo-command" type="button" onClick={() => setOpen(true)}>
        举报 @{targetHandle}
      </button>
    );
  }

  return (
    <div className="gdo-report-box">
      <label className="gdo-field">
        <span>举报原因</span>
        <select value={reason} onChange={(event) => setReason(event.target.value as ReportReason)}>
          <option value="cheat">cheat</option>
          <option value="collusion">collusion</option>
          <option value="abuse">abuse</option>
          <option value="other">other</option>
        </select>
      </label>
      <button
        className="gdo-command gdo-command--primary"
        type="button"
        onClick={() => onReport({ reporterHandle, targetHandle, gameId, reason })}
      >
        提交举报
      </button>
    </div>
  );
}
