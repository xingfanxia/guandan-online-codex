// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { ReportButton } from '../../src/components/ReportButton';
import { AdminDashboard } from '../../src/screens/AdminDashboard';

describe('moderation screens', () => {
  test('submits a report with selected reason', () => {
    const onReport = vi.fn();
    render(
      <ReportButton
        reporterHandle="fufu"
        targetHandle="momo"
        gameId="K7M2P9"
        onReport={onReport}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '举报 @momo' }));
    fireEvent.change(screen.getByLabelText('举报原因'), { target: { value: 'collusion' } });
    fireEvent.click(screen.getByRole('button', { name: '提交举报' }));

    expect(onReport).toHaveBeenCalledWith({
      reporterHandle: 'fufu',
      targetHandle: 'momo',
      gameId: 'K7M2P9',
      reason: 'collusion',
    });
  });

  test('renders admin report rows and actions', () => {
    const onBan = vi.fn();
    const onResetStats = vi.fn();

    render(
      <AdminDashboard
        reports={[{
          id: 'report:fufu:momo:K7M2P9',
          reporterHandle: 'fufu',
          targetHandle: 'momo',
          gameId: 'K7M2P9',
          reason: 'cheat',
          status: 'open',
          createdAt: '2026-05-18T00:00:00.000Z',
        }]}
        latencyAggregates={[
          { route: '/api/move', region: 'US', count: 12, p50: 120, p95: 260, p99: 310 },
          { route: '/api/move', region: 'CN', count: 4, p50: 310, p95: 470, p99: 520 },
        ]}
        onBan={onBan}
        onResetStats={onResetStats}
      />,
    );

    expect(screen.getByText('K7M2P9')).toBeInTheDocument();
    expect(screen.getByText('@momo')).toBeInTheDocument();
    expect(screen.getByText('cheat')).toBeInTheDocument();
    expect(screen.getByText('Latency')).toBeInTheDocument();
    expect(screen.getByText('US')).toBeInTheDocument();
    expect(screen.getByText('p95 260ms')).toBeInTheDocument();
    expect(screen.getByText('CN')).toBeInTheDocument();
    expect(screen.getByText('p95 470ms')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '封禁 momo' }));
    fireEvent.click(screen.getByRole('button', { name: '重置 momo' }));
    expect(onBan).toHaveBeenCalledWith('momo');
    expect(onResetStats).toHaveBeenCalledWith('momo');
  });
});
