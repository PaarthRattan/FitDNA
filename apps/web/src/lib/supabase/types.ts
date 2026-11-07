/**
 * Database types in the shape `supabase gen types typescript` produces.
 *
 * Hand-written for now because generating them needs a running database (Docker or a
 * linked project). Once the project is linked, regenerate with `npm run db:types` and
 * commit the result; it replaces this file entirely.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type GarmentCategory = "tee" | "shirt" | "knit" | "jacket";
type FitZone = "tight" | "fitted" | "ideal" | "relaxed" | "oversized";

export type Database = {
  public: {
    Tables: {
      consents: {
        Row: {
          id: number;
          user_id: string;
          scope: "data" | "scan";
          action: "granted" | "withdrawn";
          policy_version: string;
          region: string | null;
          created_at: string;
        };
        Insert: {
          id?: never;
          user_id: string;
          scope: "data" | "scan";
          action: "granted" | "withdrawn";
          policy_version: string;
          region?: string | null;
          created_at?: string;
        };
        Update: {
          id?: never;
          user_id?: string;
          scope?: "data" | "scan";
          action?: "granted" | "withdrawn";
          policy_version?: string;
          region?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      body_measurements: {
        Row: {
          id: string;
          user_id: string;
          name: "chest" | "shoulder" | "waist" | "hip" | "arm" | "torso";
          value_cm: number;
          range_cm: number | null;
          confidence: number;
          source: "manual" | "scan";
          vendor_job_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: "chest" | "shoulder" | "waist" | "hip" | "arm" | "torso";
          value_cm: number;
          range_cm?: number | null;
          confidence: number;
          source: "manual" | "scan";
          vendor_job_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: "chest" | "shoulder" | "waist" | "hip" | "arm" | "torso";
          value_cm?: number;
          range_cm?: number | null;
          confidence?: number;
          source?: "manual" | "scan";
          vendor_job_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      fit_preferences: {
        Row: {
          id: string;
          user_id: string;
          category: GarmentCategory;
          text: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          category: GarmentCategory;
          text: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          category?: GarmentCategory;
          text?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      reference_garments: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          category: GarmentCategory;
          size_label: string | null;
          chest_cm: number | null;
          chest_basis: "flat" | "circumference";
          shoulder_cm: number | null;
          length_cm: number | null;
          sleeve_cm: number | null;
          stretch: "none" | "low" | "medium" | "high";
          fit_zone: FitZone;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          category: GarmentCategory;
          size_label?: string | null;
          chest_cm?: number | null;
          chest_basis?: "flat" | "circumference";
          shoulder_cm?: number | null;
          length_cm?: number | null;
          sleeve_cm?: number | null;
          stretch?: "none" | "low" | "medium" | "high";
          fit_zone: FitZone;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          category?: GarmentCategory;
          size_label?: string | null;
          chest_cm?: number | null;
          chest_basis?: "flat" | "circumference";
          shoulder_cm?: number | null;
          length_cm?: number | null;
          sleeve_cm?: number | null;
          stretch?: "none" | "low" | "medium" | "high";
          fit_zone?: FitZone;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      has_current_consent: {
        Args: { p_scope: string };
        Returns: boolean;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
