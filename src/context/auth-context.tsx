"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type UserRole = "Admin" | "User";

export type AuthUser = {
  userId: string;
  companyId: string;
  email: string;
  role: UserRole;
  rank: string;
  firstName: string;
  lastName: string;
};

type LoginResult = { success: true; user: AuthUser } | { success: false; error: string };

type AuthContextValue = {
  user: AuthUser | null;
  isReady: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
};

const SESSION_KEY = "tems-auth-user";
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const savedUser = window.sessionStorage.getItem(SESSION_KEY);

    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser) as AuthUser);
      } catch {
        window.sessionStorage.removeItem(SESSION_KEY);
      }
    }

    setIsReady(true);
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const payload = (await response.json()) as { user?: AuthUser; error?: string };

      if (!response.ok || !payload.user) {
        return { success: false, error: payload.error || "Unable to sign in." };
      }

      setUser(payload.user);
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload.user));

      return { success: true, user: payload.user };
    } catch {
      return { success: false, error: "Unable to connect to the sign-in service." };
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    window.sessionStorage.removeItem(SESSION_KEY);
  }, []);

  const value = useMemo(() => ({ user, isReady, login, logout }), [isReady, login, logout, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }

  return context;
}
