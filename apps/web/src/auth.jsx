import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, TOKEN_KEY } from "./api.js";

const AuthCtx = createContext(null);

export function useAuth() {
  return useContext(AuthCtx);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || "");
  const [loading, setLoading] = useState(Boolean(localStorage.getItem(TOKEN_KEY)));

  const refresh = useCallback(async () => {
    if (!localStorage.getItem(TOKEN_KEY)) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const d = await api("/api/auth/me");
      setUser(d.user);
    } catch (e) {
      if (e.auth) {
        localStorage.removeItem(TOKEN_KEY);
        setToken("");
      }
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function login(newToken) {
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    setLoading(true);
    return refresh();
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setUser(null);
    setLoading(false);
  }

  return (
    <AuthCtx.Provider value={{ user, token, loading, login, logout, refresh }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function AuthCallback() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { login } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (!token) {
      navigate("/", { replace: true });
      return;
    }
    login(token)
      .then(() => navigate("/", { replace: true }))
      .catch(() => navigate("/", { replace: true }));
  }, [login, navigate]);

  return <p className="py-24 text-center text-sm text-muted-foreground">{t("nav.authProcessing")}</p>;
}