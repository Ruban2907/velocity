import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ResetPassword from '../ResetPassword';
import * as authService from '@/services/authService';

const mockToast = vi.fn();
const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/services/authService', () => ({
  resetPassword: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));


describe('ResetPassword Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('displays warning and link when reset token is missing from URL query parameters', () => {
    render(
      <MemoryRouter initialEntries={['/reset-password']}>
        <ResetPassword />
      </MemoryRouter>
    );

    expect(screen.getByText(/invalid or missing link/i)).toBeInTheDocument();
    expect(screen.getByText(/no reset token was found/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /request new link/i })).toBeInTheDocument();
  });

  it('renders password inputs when valid token is present in URL', () => {
    render(
      <MemoryRouter initialEntries={['/reset-password?token=valid-test-token-123']}>
        <ResetPassword />
      </MemoryRouter>
    );

    expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm new password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^reset password$/i })).toBeInTheDocument();
  });

  it('rejects short passwords under 6 characters', async () => {
    render(
      <MemoryRouter initialEntries={['/reset-password?token=valid-test-token-123']}>
        <ResetPassword />
      </MemoryRouter>
    );

    const passwordInput = screen.getByLabelText(/^new password$/i);
    const confirmInput = screen.getByLabelText(/confirm new password/i);
    const form = screen.getByRole('button', { name: /^reset password$/i }).closest('form')!;

    fireEvent.change(passwordInput, { target: { value: '123' } });
    fireEvent.change(confirmInput, { target: { value: '123' } });
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringMatching(/too short/i),
          variant: 'destructive',
        })
      );
    });

    expect(authService.resetPassword).not.toHaveBeenCalled();
  });

  it('rejects mismatched passwords with validation toast', async () => {
    render(
      <MemoryRouter initialEntries={['/reset-password?token=valid-test-token-123']}>
        <ResetPassword />
      </MemoryRouter>
    );

    const passwordInput = screen.getByLabelText(/^new password$/i);
    const confirmInput = screen.getByLabelText(/confirm new password/i);
    const form = screen.getByRole('button', { name: /^reset password$/i }).closest('form')!;

    fireEvent.change(passwordInput, { target: { value: 'SecurePass123!' } });
    fireEvent.change(confirmInput, { target: { value: 'DifferentPass123!' } });
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringMatching(/do not match/i),
          variant: 'destructive',
        })
      );
    });

    expect(authService.resetPassword).not.toHaveBeenCalled();
  });

  it('calls resetPassword with token and new password upon valid submission', async () => {
    vi.mocked(authService.resetPassword).mockResolvedValue({
      success: true,
      message: 'Password reset successful',
    });

    render(
      <MemoryRouter initialEntries={['/reset-password?token=valid-test-token-123']}>
        <ResetPassword />
      </MemoryRouter>
    );

    const passwordInput = screen.getByLabelText(/^new password$/i);
    const confirmInput = screen.getByLabelText(/confirm new password/i);
    const form = screen.getByRole('button', { name: /^reset password$/i }).closest('form')!;

    fireEvent.change(passwordInput, { target: { value: 'SecurePassword123!' } });
    fireEvent.change(confirmInput, { target: { value: 'SecurePassword123!' } });
    fireEvent.submit(form);

    await waitFor(() => {
      expect(authService.resetPassword).toHaveBeenCalledWith(
        'valid-test-token-123',
        'SecurePassword123!'
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/password reset complete/i)).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/login');
    }, { timeout: 3000 });
  });


  it('handles reset API errors safely and displays error toast', async () => {
    vi.mocked(authService.resetPassword).mockRejectedValue({
      response: {
        data: {
          message: 'Invalid or expired password reset token.',
        },
      },
    });

    render(
      <MemoryRouter initialEntries={['/reset-password?token=expired-token-123']}>
        <ResetPassword />
      </MemoryRouter>
    );

    const passwordInput = screen.getByLabelText(/^new password$/i);
    const confirmInput = screen.getByLabelText(/confirm new password/i);
    const form = screen.getByRole('button', { name: /^reset password$/i }).closest('form')!;

    fireEvent.change(passwordInput, { target: { value: 'SecurePassword123!' } });
    fireEvent.change(confirmInput, { target: { value: 'SecurePassword123!' } });
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Reset failed',
          description: 'Invalid or expired password reset token.',
          variant: 'destructive',
        })
      );
    });
  });
});
