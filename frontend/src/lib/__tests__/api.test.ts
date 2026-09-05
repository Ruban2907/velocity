import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import api, { getApiBaseUrl } from '../api';

describe('Frontend API Client Configuration', () => {
  const originalEnv = import.meta.env.VITE_API_URL;

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('exports api axios instance with configured baseURL', () => {
    expect(api).toBeDefined();
    expect(api.defaults.baseURL).toMatch(/\/api$/);
  });

  it('computes baseURL with trailing slashes stripped when VITE_API_URL is provided', () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:3000/');
    expect(getApiBaseUrl()).toBe('http://localhost:3000');
  });

  it('returns empty string when VITE_API_URL is empty for same-origin proxy', () => {
    vi.stubEnv('VITE_API_URL', '');
    expect(getApiBaseUrl()).toBe('');
  });
});
