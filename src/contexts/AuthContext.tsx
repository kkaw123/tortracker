import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { User, OutletCode, UserRole } from '../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
  canViewOutlet: (outletCode: OutletCode) => boolean;
  canViewCostPrice: () => boolean;
  isHQ: () => boolean;
  isBoss: () => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('tortracker_user');
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        localStorage.removeItem('tortracker_user');
      }
    }
    setLoading(false);
  }, []);

  async function login(username: string, password: string) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username.toLowerCase())
        .single();

      if (error || !data) return { error: 'Invalid username or password.' };

      // Simple password check (in production use bcrypt via Edge Function)
      if (data.password_hash !== btoa(password)) {
        return { error: 'Invalid username or password.' };
      }

      const { data: outletData } = await supabase
        .from('outlets')
        .select('code')
        .eq('id', data.outlet_id)
        .single();

      const userObj: User = {
        id: data.id,
        username: data.username,
        name: data.name,
        role: data.role as UserRole,
        outlet_id: data.outlet_id,
        outlet_code: outletData?.code ?? null,
      };

      setUser(userObj);
      localStorage.setItem('tortracker_user', JSON.stringify(userObj));
      return { error: null };
    } catch {
      return { error: 'Connection error. Please try again.' };
    }
  }

  async function logout() {
    setUser(null);
    localStorage.removeItem('tortracker_user');
  }

  function canViewOutlet(outletCode: OutletCode) {
    if (!user) return false;
    if (user.role === 'boss') return true;
    if (user.role === 'joey') return true;
    // PLT admins can see all outlets
    if (user.outlet_code === 'PLT') return true;
    return user.outlet_code === outletCode;
  }

  function canViewCostPrice() {
    if (!user) return false;
    return user.role === 'boss' || user.role === 'joey' || user.role === 'pic';
  }

  function isHQ() {
    return user?.outlet_code === 'PLT' || user?.role === 'boss' || user?.role === 'joey';
  }

  function isBoss() {
    return user?.role === 'boss';
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, canViewOutlet, canViewCostPrice, isHQ, isBoss }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
