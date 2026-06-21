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

  it('renders the settings toggle button', () => {
    renderWithI18n(<Generator />);
    expect(screen.getByText('Setări')).toBeInTheDocument();
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

  it('shows settings fields when toggle is clicked', () => {
    renderWithI18n(<Generator />);
    const settingsBtn = screen.getByText('Setări');
    fireEvent.click(settingsBtn);

    expect(screen.getByText('Durată (sec)')).toBeInTheDocument();
    expect(screen.getByText('Rezoluție')).toBeInTheDocument();
    expect(screen.getByText('Narare audio')).toBeInTheDocument();
  });

  it('shows voice selector when audio narration is enabled', () => {
    renderWithI18n(<Generator />);
    // Open settings
    const settingsBtn = screen.getByText('Setări');
    fireEvent.click(settingsBtn);

    // Enable audio narration
    const audioCheckbox = screen.getByLabelText(/Narare audio/);
    fireEvent.click(audioCheckbox);

    // Voice selector should appear
    expect(screen.getByText('Voce narator')).toBeInTheDocument();
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

    const textarea = screen.getByPlaceholderText(/Descrie videoclipul/);
    await user.type(textarea, 'Test video');

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
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    localStorageMock.getItem.mockReturnValue('[]');
  });

  it('shows idle state initially', () => {
    renderWithI18n(<Generator />);
    expect(screen.queryByText(/Se pregătește/)).not.toBeInTheDocument();
  });
});
