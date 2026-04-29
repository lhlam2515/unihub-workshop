import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import { createContext, useContext, useEffect, useState } from "react";
import { Text, View } from "react-native";

import type { DatabaseClient } from "./client";

// ── Context ─────────────────────────────────────────────────

const DatabaseContext = createContext<DatabaseClient | null>(null);

type DatabaseMigrations = (typeof import("./migrations/migrations"))["default"];
type DatabaseStartupStatus = "bootstrapping" | "migrations" | "ready" | "error";

// ── Provider ────────────────────────────────────────────────

interface DatabaseProviderProps {
  children: React.ReactNode;
  onStatusChange?: (status: DatabaseStartupStatus) => void;
}

/**
 * Wraps the app with a database context that:
 * 1. Runs drizzle migrations on mount (creates/updates tables)
 * 2. Exposes the typed database client via React context
 * 3. Reports startup state so the root layout can render a single loading screen
 */
export function DatabaseProvider({
  children,
  onStatusChange,
}: DatabaseProviderProps) {
  const [db, setDb] = useState<DatabaseClient | null>(null);
  const [migrations, setMigrations] = useState<DatabaseMigrations | null>(null);
  const [bootstrapError, setBootstrapError] = useState<Error | null>(null);
  const [startupStatus, setStartupStatus] =
    useState<DatabaseStartupStatus>("bootstrapping");

  useEffect(() => {
    onStatusChange?.(startupStatus);
  }, [onStatusChange, startupStatus]);

  useEffect(() => {
    let isActive = true;

    async function bootstrapDatabase() {
      try {
        const [{ createDatabaseClient }, migrationsModule] = await Promise.all([
          import("./client"),
          import("./migrations/migrations"),
        ]);

        if (!isActive) {
          return;
        }

        setDb(createDatabaseClient());
        setMigrations(migrationsModule.default);
        setStartupStatus("migrations");
      } catch (error) {
        if (!isActive) {
          return;
        }

        setStartupStatus("error");
        setBootstrapError(
          error instanceof Error
            ? error
            : new Error("Failed to initialize database")
        );
      }
    }

    bootstrapDatabase();

    return () => {
      isActive = false;
    };
  }, []);

  if (bootstrapError) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ color: "red", fontSize: 16, fontWeight: "bold" }}>
          Database Bootstrap Error
        </Text>
        <Text
          style={{
            color: "red",
            marginTop: 8,
            paddingHorizontal: 24,
            textAlign: "center",
          }}
        >
          {bootstrapError.message}
        </Text>
      </View>
    );
  }

  if (!db || !migrations) {
    return null;
  }

  return (
    <DatabaseMigrationGate
      db={db}
      migrations={migrations}
      onStatusChange={setStartupStatus}
    >
      {children}
    </DatabaseMigrationGate>
  );
}

interface DatabaseMigrationGateProps {
  db: DatabaseClient;
  migrations: DatabaseMigrations;
  children: React.ReactNode;
  onStatusChange?: (status: DatabaseStartupStatus) => void;
}

function DatabaseMigrationGate({
  db,
  migrations,
  children,
  onStatusChange,
}: DatabaseMigrationGateProps) {
  const { success, error } = useMigrations(db, migrations);

  useEffect(() => {
    if (error) {
      onStatusChange?.("error");
      return;
    }

    if (success) {
      onStatusChange?.("ready");
      return;
    }

    onStatusChange?.("migrations");
  }, [error, onStatusChange, success]);

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ color: "red", fontSize: 16, fontWeight: "bold" }}>
          Database Migration Error
        </Text>
        <Text
          style={{
            color: "red",
            marginTop: 8,
            paddingHorizontal: 24,
            textAlign: "center",
          }}
        >
          {error.message}
        </Text>
      </View>
    );
  }

  if (!success) {
    return null;
  }

  return (
    <DatabaseContext.Provider value={db}>{children}</DatabaseContext.Provider>
  );
}

// ── Hook ────────────────────────────────────────────────────

/**
 * Access the typed drizzle database client from any component
 * wrapped inside `<DatabaseProvider>`.
 *
 * @throws If called outside of DatabaseProvider
 */
export function useDatabase(): DatabaseClient {
  const context = useContext(DatabaseContext);
  if (!context) {
    throw new Error("useDatabase must be used within a <DatabaseProvider>");
  }
  return context;
}
