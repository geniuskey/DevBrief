import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ReactNode } from "react";
import { api, errorMessage } from "../api/client";
import type { Capabilities, Me, Repository, Team } from "../types";

interface Session {
  me: Me | null;
  capabilities: Capabilities | null;
  repositories: Repository[];
  teams: Team[];
  loading: boolean;
  error: string;
  isAdmin: boolean;
  isDemo: boolean;
  reloadTeams: () => Promise<void>;
  repoName: (id: string) => string;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const reloadTeams = useCallback(async () => {
    setTeams(await api<Team[]>("/teams"));
  }, []);
  useEffect(() => {
    Promise.all([
      api<Me>("/me").then(setMe),
      api<Capabilities>("/settings/capabilities").then(setCapabilities),
      api<Repository[]>("/repositories").then(setRepositories),
      api<Team[]>("/teams").then(setTeams),
    ])
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, []);
  const repoName = useCallback(
    (id: string) => repositories.find((r) => r.id === id)?.full_name ?? id,
    [repositories],
  );
  return (
    <SessionContext.Provider
      value={{
        me,
        capabilities,
        repositories,
        teams,
        loading,
        error,
        isAdmin: me?.role === "admin",
        isDemo: capabilities?.adapter_mode === "fake",
        reloadTeams,
        repoName,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("SessionProvider missing");
  return ctx;
}
