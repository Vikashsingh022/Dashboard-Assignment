import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const AuthContext = createContext();

const TOKEN_KEY = 'hrms_token';
const EXPIRY_KEY = 'hrms_token_expiry';
const SESSION_DURATION = 2 * 60 * 60 * 1000; // 2 hours in ms

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem(TOKEN_KEY));
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Check token validity on mount
  useEffect(() => {
    const expiry = localStorage.getItem(EXPIRY_KEY);
    if (token && expiry && Date.now() < parseInt(expiry, 10)) {
      setUser({}); // Optionally decode token for user info
      setLoading(false);
      // Set auto-logout timer
      const timeout = setTimeout(logout, parseInt(expiry, 10) - Date.now());
      return () => clearTimeout(timeout);
    } else {
      logout();
    }
    // eslint-disable-next-line
  }, []);

  // Login function
  const login = async (email, password) => {
    setLoading(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      if (!res.ok) throw new Error('Invalid credentials');
      const data = await res.json();
      const expiry = Date.now() + SESSION_DURATION;
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(EXPIRY_KEY, expiry);
      setToken(data.token);
      setUser({}); // Optionally decode token for user info
      setLoading(false);
      // Set auto-logout timer
      setTimeout(logout, SESSION_DURATION);
      navigate('/');
      return { success: true };
    } catch (err) {
      setLoading(false);
      return { success: false, message: err.message };
    }
  };

  // Register function
  const register = async (name, email, password) => {
    setLoading(true);
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });
      if (!res.ok) throw new Error('Registration failed');
      const data = await res.json();
      const expiry = Date.now() + SESSION_DURATION;
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(EXPIRY_KEY, expiry);
      setToken(data.token);
      setUser({});
      setLoading(false);
      setTimeout(logout, SESSION_DURATION);
      navigate('/');
      return { success: true };
    } catch (err) {
      setLoading(false);
      return { success: false, message: err.message };
    }
  };

  // Logout function
  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EXPIRY_KEY);
    setToken(null);
    setUser(null);
    setLoading(false);
    navigate('/login');
  }, [navigate]);

  // Auth context value
  const value = {
    user,
    token,
    loading,
    login,
    register,
    logout,
    isAuthenticated: !!token && !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
} 