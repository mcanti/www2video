import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '../i18n/useTranslation.jsx';
import Generator from './Generator.jsx';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock window.location
delete window.location;
window.location = { search: '', href: 'http://localhost/', origin: 'http://localhost' };

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn((key) => store[key] || '[]'),
    setItem: vi.fn((key, value) => { store[key] = value; }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Wrapper with I18nProvider — default lang is RO
function renderWithI18n(ui) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

describe('Generator Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    localStorageMock.getItem.mockReturnValue('[]');
  });

  it('renders the header with app title', () => {
    renderWithI18n(<Generator />);
    expect(screen.getByText('www2video')).toBeInTheDocument();
    expect(screen.getByText('Generator video AI')).toBeInTheDocument();
  });

  it('renders collapsible section headers', () => {
    renderWithI18n(<Generator />);
    expect(screen.getByText('Conținut')).toBeInTheDocument();
    expect(screen.getByText('Setări tehnice')).toBeInTheDocument();
    expect(screen.getByText('Audio')).toBeInTheDocument();
    expect(screen.getByText('Avansat')).toBeInTheDocument();
  });

  it('renders the generate button', () => {
    renderWithI18n(<Generator />);
    expect(screen.getByText(/Generează video/)).toBeInTheDocument();
  });

  it('has prompt textarea', () => {
    renderWithI18n(<Generator />);
    const textarea = screen.getByPlaceholderText(/Descrie videoclipul/);
    expect(textarea).toBeInTheDocument();
  });

  it('shows technical settings when section expanded', () => {
    renderWithI18n(<Generator />);
    const techSection = screen.getByText('Setări tehnice');
    fireEvent.click(techSection);
    expect(screen.getByText('Durată (secunde)')).toBeInTheDocument();
    expect(screen.getByText('Rezoluție')).toBeInTheDocument();
  });

  it('toggles audio section to reveal voice selector', () => {
    renderWithI18n(<Generator />);
    const audioSection = screen.getByText('Audio');
    fireEvent.click(audioSection);
    // The audio checkbox — the label contains "Narare audio" text
    const audioCheckbox = screen.getByLabelText(/Narare audio/);
    fireEvent.click(audioCheckbox);
    waitFor(() => {
      expect(screen.getByText('Voce narator')).toBeInTheDocument();
    });
  });

  it('disables generate button when prompt is empty', () => {
    renderWithI18n(<Generator />);
    const btn = screen.getByText(/Generează video/);
    expect(btn).toBeDisabled();
  });

  it('handles generate request (mocked fetch)', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({
        videoId: 'test-video-id',
        status: 'generating',
        progress: { step: 'queued', message: 'In queue...', pct: 0 },
      }),
    });

    const user = userEvent.setup();
    renderWithI18n(<Generator />);

    // Type a prompt
    const textarea = screen.getByPlaceholderText(/Descrie videoclipul/);
    await user.type(textarea, 'Test video');

    // Click generate
    const btn = screen.getByText(/Generează video/);
    expect(btn).not.toBeDisabled();
    await user.click(btn);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/video/generate',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });
});

describe('Generator — render states', () => {
  it('shows idle state initially', () => {
    renderWithI18n(<Generator />);
    expect(screen.queryByText(/Se pregătește/)).not.toBeInTheDocument();
  });
});
