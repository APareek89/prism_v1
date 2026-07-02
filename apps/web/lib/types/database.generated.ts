// lib/types/database.generated.ts
//
// PLACEHOLDER generated DB types. The real file is produced by:
//
//   npm run db:types     # supabase gen types typescript --local > lib/types/database.generated.ts
//
// It is regenerated whenever the migrations change. Until the local Supabase stack
// has been started and migrated, this minimal `Database` shape lets the Supabase
// clients type-check and the app build keyless. Do NOT hand-edit beyond this stub —
// run the script instead.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
