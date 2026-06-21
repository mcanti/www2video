import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

describe('Generator Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    localStorageMock.getItem.mockReturnValue('[]');
  });

  it('renders the header with app title', () => {
    render(<Generator />);
    expect(screen.getByText('www2video')).toBeInTheDocument();
    expect(screen.getByText('AI video generator')).toBeInTheDocument();
  });

  it('renders collapsible section headers', () => {
    render(<Generator />);
    expect(screen.getByText('Conținut')).toBeInTheDocument();
    expect(screen.getByText('Setări tehnice')).toBeInTheDocument();
    expect(screen.getByText('Audio')).toBeInTheDocument();
    expect(screen.getByText('Avansat')).toBeInTheDocument();
  });

  it('renders the generate button', () => {
    render(<Generator />);
    expect(screen.getByText('🚀 Generare video')).toBeInTheDocument();
  });

  it('has prompt textarea', () => {
    render(<Generator />);
    const textarea = screen.getByPlaceholderText(/clip de prezentare/);
    expect(textarea).toBeInTheDocument();
  });

  it('shows technical settings when section expanded', () => {
    render(<Generator />);
    const techSection = screen.getByText('Setări tehnice');
    fireEvent.click(techSection);
    expect(screen.getByText('Durată (secunde)')).toBeInTheDocument();
    expect(screen.getByText('Rezoluție')).toBeInTheDocument();
  });

  it('toggles audio section to reveal voice selector', () => {
    render(<Generator />);
    const audioSection = screen.getByText('Audio');
    fireEvent.click(audioSection);
    const audioCheckbox = screen.getByLabelText(/Audio/);
    fireEvent.click(audioCheckbox);
    // Wait for conditional render
    waitFor(() => {
      expect(screen.getByText('Voce narator')).toBeInTheDocument();
    });
  });

  it('disables generate button when prompt is empty', () => {
    render(<Generator />);
    const btn = screen.getByText('🚀 Generare video');
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
    render(<Generator />);

    // Type a prompt
    const textarea = screen.getByPlaceholderText(/clip de prezentare/);
    await user.type(textarea, 'Test video');

    // Click generate
    const btn = screen.getByText('🚀 Generare video');
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
    render(<Generator />);
    expect(screen.queryByText('⏳ Se pregătește...')).not.toBeInTheDocument();
  });
});
