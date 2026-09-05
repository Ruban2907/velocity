import api from '@/lib/api';

export interface SignupData {
  firstname: string;
  lastname?: string;
  companyname?: string;
  email: string;
  password: string;
}

export interface SigninData {
  email: string;
  password: string;
}

export interface User {
  _id: string;
  firstname: string;
  lastname?: string;
  companyname?: string;
  email: string;
  role: 'user' | 'admin';
  picture?: {
    data: string | Buffer;
    contentType: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  data: {
    user: User;
    token: string;
  };
}

export interface SignupResponse {
  success: boolean;
  message: string;
  data: User;
}

export interface ForgotPasswordResponse {
  success: boolean;
  message: string;
}

export const signup = async (data: SignupData): Promise<SignupResponse> => {
  const response = await api.post<SignupResponse>('/auth/signup', data);
  return response.data;
};

export const signin = async (data: SigninData): Promise<AuthResponse> => {
  const response = await api.post<AuthResponse>('/auth/signin', data);
  return response.data;
};

export const logout = async (): Promise<void> => {
  await api.post('/auth/logout');
};

export const getCurrentUser = async (): Promise<{ success: boolean; data: User }> => {
  const response = await api.get<{ success: boolean; data: User }>('/users/me');
  return response.data;
};

export const forgotPassword = async (
  email: string
): Promise<ForgotPasswordResponse> => {
  const response = await api.post<ForgotPasswordResponse>('/auth/forgot-password', {
    email,
  });
  return response.data;
};

export const resetPassword = async (
  token: string,
  password: string
): Promise<ForgotPasswordResponse> => {
  const response = await api.post<ForgotPasswordResponse>('/auth/reset-password', {
    token,
    password,
  });
  return response.data;
};


