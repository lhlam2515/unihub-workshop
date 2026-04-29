import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import React, { createContext, useContext, useEffect, useState } from "react";
import { Text, View } from "react-native";

import type { DatabaseClient } from "./client";

// ── Context ─────────────────────────────────────────────────

const DatabaseContext = createContext<DatabaseClient | null>(null);

type DatabaseMigrations = (typeof import("./migrations/migrations"))["default"];

// ── Provider ────────────────────────────────────────────────

interface DatabaseProviderProps {
  children: React.ReactNode;
}

/**
 * Wraps the app with a database context that:
 * 1. Runs drizzle migrations on mount (creates/updates tables)
 * 2. Blocks rendering until migrations complete
 * 3. Exposes the typed database client via React context
 */
export function DatabaseProvider({ children }: DatabaseProviderProps) {
  const [db, setDb] = useState<DatabaseClient | null>(null);
  const [migrations, setMigrations] = useState<DatabaseMigrations | null>(null);
  const [bootstrapError, setBootstrapError] = useState<Error | null>(null);

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
      } catch (error) {
        if (!isActive) {
          return;
        }

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
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ fontSize: 14, color: "#888" }}>
          Đang khởi tạo cơ sở dữ liệu...
        </Text>
      </View>
    );
  }

  return (
    <DatabaseMigrationGate db={db} migrations={migrations}>
      {children}
    </DatabaseMigrationGate>
  );
}

interface DatabaseMigrationGateProps {
  db: DatabaseClient;
  migrations: DatabaseMigrations;
  children: React.ReactNode;
}

function DatabaseMigrationGate({
  db,
  migrations,
  children,
}: DatabaseMigrationGateProps) {
  const { success, error } = useMigrations(db, migrations);

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
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ fontSize: 14, color: "#888" }}>
          Đang khởi tạo cơ sở dữ liệu...
        </Text>
      </View>
    );
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
