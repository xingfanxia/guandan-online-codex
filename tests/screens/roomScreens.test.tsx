// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { CreateRoomScreen } from '../../src/screens/CreateRoom';
import { HandleSetupScreen } from '../../src/screens/HandleSetup';
import { RoomBrowserScreen } from '../../src/screens/RoomBrowser';
import { WaitingRoomScreen } from '../../src/screens/WaitingRoom';

describe('room screens', () => {
  test('submits the player handle setup form', () => {
    const onCreateHandle = vi.fn();
    render(<HandleSetupScreen onCreateHandle={onCreateHandle} />);

    fireEvent.change(screen.getByRole('textbox', { name: '玩家名' }), { target: { value: '@Momo' } });
    fireEvent.click(screen.getByRole('button', { name: '进入大厅' }));

    expect(onCreateHandle).toHaveBeenCalledWith({ handle: '@Momo' });
  });

  test('submits create-room options', () => {
    const onCreate = vi.fn();
    render(<CreateRoomScreen hostHandle="@Fufu" onCreate={onCreate} />);

    fireEvent.click(screen.getByRole('button', { name: '8P' }));
    fireEvent.click(screen.getByRole('button', { name: '四队模式' }));
    fireEvent.click(screen.getByRole('button', { name: '换牌' }));
    fireEvent.click(screen.getByRole('button', { name: '创建房间' }));

    expect(onCreate).toHaveBeenCalledWith({
      hostHandle: '@Fufu',
      mode: '8',
      rules: { cardExchange: true, teamStructure: 'teams-of-2' },
      visibility: 'public',
    });
  });

  test('renders waiting-room slots and start command', () => {
    const onStart = vi.fn();
    const onKick = vi.fn();
    render(
      <WaitingRoomScreen
        code="K7M2P9"
        players={[
          { id: 'p1', handle: 'fufu', role: 'host' },
          { id: 'p2', handle: 'momo', role: 'player' },
        ]}
        maxPlayers={4}
        onStart={onStart}
        onKick={onKick}
      />,
    );

    expect(screen.getByText('K7M2P9')).toBeInTheDocument();
    expect(screen.getByText('@fufu')).toBeInTheDocument();
    expect(screen.getByText('@momo')).toBeInTheDocument();
    expect(screen.getAllByText('BOT')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: '踢出 momo' }));
    expect(onKick).toHaveBeenCalledWith('p2');

    fireEvent.click(screen.getByRole('button', { name: '开始' }));
    expect(onStart).toHaveBeenCalledWith({ fillBots: true, botDifficulty: 'easy' });
  });

  test('renders room browser rows and join command', () => {
    const onJoin = vi.fn();
    render(
      <RoomBrowserScreen
        rooms={[{
          code: 'K7M2P9',
          hostHandle: 'fufu',
          players: [{ id: 'p1', handle: 'fufu', role: 'host' }],
          mode: '4',
          maxPlayers: 4,
          visibility: 'public',
          status: 'waiting',
          updatedAt: '2026-05-18T00:00:00.000Z',
        }]}
        onJoin={onJoin}
      />,
    );

    expect(screen.getByText('K7M2P9')).toBeInTheDocument();
    expect(screen.getByText('1/4')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '加入 K7M2P9' }));
    expect(onJoin).toHaveBeenCalledWith('K7M2P9');
  });

  test('renders an empty public-room state', () => {
    render(<RoomBrowserScreen rooms={[]} onJoin={vi.fn()} />);

    expect(screen.getByLabelText('Room browser')).toBeInTheDocument();
    expect(screen.getByText('暂无公开房间')).toBeInTheDocument();
  });
});
