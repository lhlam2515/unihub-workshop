import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import React, { createContext, useContext } from "react";
import { Text, View } from "react-native";

import { db, type DatabaseClient } from "./client";
import migrations from "./migrations/migrations";

// ── Context ─────────────────────────────────────────────────

const DatabaseContext = createContext<DatabaseClient | null>(null);

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
