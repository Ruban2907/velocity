import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import ForgotPassword from '../ForgotPassword';
import * as authService from '@/services/authService';

vi.mock('@/services/authService', () => ({
  forgotPassword: vi.fn(),
}));

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

describe('ForgotPassword Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = () =>
    render(
      <BrowserRouter>
        <ForgotPassword />
      </BrowserRouter>
    );

  it('renders email input and submit button', () => {
    renderComponent();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
  });

  it('submits the correct email and displays generic success message without leaking account existence', async () => {
    vi.mocked(authService.forgotPassword).mockResolvedValue({
      success: true,
      message: 'If an account exists for this email, a password reset link has been sent.',
    });

    renderComponent();
    const emailInput = screen.getByLabelText(/email address/i);
    const form = screen.getByRole('button', { name: /send reset link/i }).closest('form')!;

    fireEvent.change(emailInput, { target: { value: 'user@example.com' } });
    fireEvent.submit(form);

    await waitFor(() => {
      expect(authService.forgotPassword).toHaveBeenCalledWith('user@example.com');
    });

    await waitFor(() => {
      expect(screen.getByText(/check your inbox/i)).toBeInTheDocument();
      expect(screen.getByText(/password reset link has been dispatched/i)).toBeInTheDocument();
    });
  });

  it('displays generic success response even when non-existent email is submitted', async () => {
    vi.mocked(authService.forgotPassword).mockResolvedValue({
      success: true,
      message: 'If an account exists for this email, a password reset link has been sent.',
    });

    renderComponent();
    const emailInput = screen.getByLabelText(/email address/i);
    const form = screen.getByRole('button', { name: /send reset link/i }).closest('form')!;

    fireEvent.change(emailInput, { target: { value: 'nonexistent@example.com' } });
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText(/check your inbox/i)).toBeInTheDocument();
    });
  });

  it('handles API failure safely without exposing error details to the user', async () => {
    vi.mocked(authService.forgotPassword).mockRejectedValue(new Error('Network error'));

    renderComponent();
    const emailInput = screen.getByLabelText(/email address/i);
    const form = screen.getByRole('button', { name: /send reset link/i }).closest('form')!;

    fireEvent.change(emailInput, { target: { value: 'user@example.com' } });
    fireEvent.submit(form);

    // Should still display generic safe feedback
    await waitFor(() => {
      expect(screen.getByText(/check your inbox/i)).toBeInTheDocument();
    });
  });
});
