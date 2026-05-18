// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import {
  OrientationLock,
  resolveOrientationMode,
} from '../../src/components/OrientationLock';

describe('OrientationLock', () => {
  test('resolves native landscape when width is greater than height', () => {
    expect(resolveOrientationMode({ width: 852, height: 393, canRotate: true })).toBe('landscape');
  });

  test('uses CSS rotate for portrait mobile when rotation is allowed', () => {
    expect(resolveOrientationMode({ width: 393, height: 852, canRotate: true })).toBe('portrait-rotated');
  });

  test('falls back to prompt when portrait cannot be rotated', () => {
    expect(resolveOrientationMode({ width: 393, height: 852, canRotate: false })).toBe('portrait-prompt');
  });

  test('wraps children with orientation mode metadata', () => {
    render(
      <OrientationLock viewport={{ width: 393, height: 852 }} canRotate>
        <div>table</div>
      </OrientationLock>,
    );

    expect(screen.getByLabelText('Landscape game viewport')).toHaveClass('gdo-orientation--portrait-rotated');
    expect(screen.getByLabelText('Landscape game viewport')).toHaveAttribute('data-orientation-mode', 'portrait-rotated');
    expect(screen.getByText('table')).toBeInTheDocument();
  });

  test('shows rotate prompt instead of children when no rotate fallback is available', () => {
    render(
      <OrientationLock viewport={{ width: 393, height: 852 }} canRotate={false}>
        <div>table</div>
      </OrientationLock>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('请横屏继续');
    expect(screen.queryByText('table')).not.toBeInTheDocument();
  });
});
