import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '../ProtectedRoute';
import * as authContext from '@/context/AuthContext';

vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

describe('ProtectedRoute Component', () => {
  it('renders loading spinner while authentication status is resolving', () => {
    vi.mocked(authContext.useAuth).mockReturnValue({
      isAuthenticated: false,
      loading: true,
      user: null,
      login: vi.fn(),
      signup: vi.fn(),
      logout: vi.fn(),
      updateUser: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('redirects unauthenticated user to /login', () => {
    vi.mocked(authContext.useAuth).mockReturnValue({
      isAuthenticated: false,
      loading: false,
      user: null,
      login: vi.fn(),
      signup: vi.fn(),
      logout: vi.fn(),
      updateUser: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>Secret Dashboard</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>Sign In Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByText('Secret Dashboard')).not.toBeInTheDocument();
    expect(screen.getByText('Sign In Page')).toBeInTheDocument();
  });

  it('renders protected child component for authenticated user', () => {
    vi.mocked(authContext.useAuth).mockReturnValue({
      isAuthenticated: true,
      loading: false,
      user: {
        _id: '123',
        firstname: 'Jane',
        lastname: 'Recruiter',
        email: 'jane@example.com',
        role: 'user',
        companyname: 'Acme',
      },
      login: vi.fn(),
      signup: vi.fn(),
      logout: vi.fn(),
      updateUser: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <ProtectedRoute>
          <div>Welcome to Recruiter Dashboard</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByText('Welcome to Recruiter Dashboard')).toBeInTheDocument();
  });
});
