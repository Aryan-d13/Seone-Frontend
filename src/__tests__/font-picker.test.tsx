import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import FontPicker from '@/features/editor/components/Inspector/FontPicker';

describe('FontPicker', () => {
  const baseFonts = [
    {
      family: 'Inter',
      display: 'Inter',
      weights: [400, 500, 700],
      scripts: ['latin'],
      source: 'builtin',
    },
    {
      family: 'Custom Sans',
      display: 'Custom Sans',
      weights: [600],
      scripts: ['custom'],
      source: 'uploaded',
    },
  ];

  it('renders uploaded fonts and snaps to the nearest available weight on select', () => {
    const onChange = vi.fn();
    const onWeightChange = vi.fn();

    render(
      <FontPicker
        fonts={baseFonts}
        value="Inter"
        weight={650}
        onChange={onChange}
        onWeightChange={onWeightChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /inter/i }));
    fireEvent.click(screen.getByRole('button', { name: /custom sans/i }));

    expect(onChange).toHaveBeenCalledWith('Custom Sans');
    expect(onWeightChange).toHaveBeenCalledWith(600);
  });

  it('shows a missing-font warning and upload action', () => {
    const onUpload = vi.fn();

    render(
      <FontPicker
        fonts={baseFonts}
        value="Missing Font"
        weight={400}
        missing
        onChange={() => {}}
        onUpload={onUpload}
        uploadLabel="Upload custom font"
      />,
    );

    expect(screen.getByText(/missing from the runtime catalog/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /upload custom font/i }));
    expect(onUpload).toHaveBeenCalledTimes(1);
  });
});
