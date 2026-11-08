
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "ai_runs": {
                  Row: {
                    "cached_tokens": number | null,"created_at": string,"error": string | null,"id": number,"input_hash": string,"input_tokens": number | null,"latency_ms": number | null,"model": string,"output": Json | null,"output_tokens": number | null,"prompt_version": string,"status": string,"task": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cached_tokens"?: number | null,"created_at"?: string,"error"?: string | null,"id"?: never,"input_hash": string,"input_tokens"?: number | null,"latency_ms"?: number | null,"model": string,"output"?: Json | null,"output_tokens"?: number | null,"prompt_version": string,"status": string,"task": string
                  }
                  Update: {
                    "cached_tokens"?: number | null,"created_at"?: string,"error"?: string | null,"id"?: never,"input_hash"?: string,"input_tokens"?: number | null,"latency_ms"?: number | null,"model"?: string,"output"?: Json | null,"output_tokens"?: number | null,"prompt_version"?: string,"status"?: string,"task"?: string
                  }
                  Relationships: [
                    
                  ]
                },"body_measurements": {
                  Row: {
                    "confidence": number,"created_at": string,"id": string,"name": string,"range_cm": number | null,"source": string,"updated_at": string,"user_id": string,"value_cm": number,"vendor_job_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "confidence": number,"created_at"?: string,"id"?: string,"name": string,"range_cm"?: number | null,"source": string,"updated_at"?: string,"user_id": string,"value_cm": number,"vendor_job_id"?: string | null
                  }
                  Update: {
                    "confidence"?: number,"created_at"?: string,"id"?: string,"name"?: string,"range_cm"?: number | null,"source"?: string,"updated_at"?: string,"user_id"?: string,"value_cm"?: number,"vendor_job_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"consents": {
                  Row: {
                    "action": string,"created_at": string,"id": number,"policy_version": string,"region": string | null,"scope": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"created_at"?: string,"id"?: never,"policy_version": string,"region"?: string | null,"scope": string,"user_id": string
                  }
                  Update: {
                    "action"?: string,"created_at"?: string,"id"?: never,"policy_version"?: string,"region"?: string | null,"scope"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"fit_preferences": {
                  Row: {
                    "category": string,"created_at": string,"id": string,"text": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category": string,"created_at"?: string,"id"?: string,"text": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "category"?: string,"created_at"?: string,"id"?: string,"text"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"listing_extractions": {
                  Row: {
                    "confidence": number,"content_hash": string | null,"created_at": string,"extractor_version": string,"fields": NonNullable<Json>,"id": string,"listing_id": string,"source": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "confidence": number,"content_hash"?: string | null,"created_at"?: string,"extractor_version": string,"fields": NonNullable<Json>,"id"?: string,"listing_id": string,"source": string,"updated_at"?: string
                  }
                  Update: {
                    "confidence"?: number,"content_hash"?: string | null,"created_at"?: string,"extractor_version"?: string,"fields"?: NonNullable<Json>,"id"?: string,"listing_id"?: string,"source"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "listing_extractions_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    }
                  ]
                },"listing_imports": {
                  Row: {
                    "created_at": string,"error_code": string | null,"id": string,"listing_id": string,"status": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"error_code"?: string | null,"id"?: string,"listing_id": string,"status"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"error_code"?: string | null,"id"?: string,"listing_id"?: string,"status"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "listing_imports_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    }
                  ]
                },"listing_overrides": {
                  Row: {
                    "category": string | null,"chest_basis": string | null,"chest_cm": number | null,"cleared": (string)[],"created_at": string,"length_cm": number | null,"listing_id": string,"shoulder_cm": number | null,"size_label": string | null,"sleeve_cm": number | null,"stretch": string | null,"title": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category"?: string | null,"chest_basis"?: string | null,"chest_cm"?: number | null,"cleared"?: (string)[],"created_at"?: string,"length_cm"?: number | null,"listing_id": string,"shoulder_cm"?: number | null,"size_label"?: string | null,"sleeve_cm"?: number | null,"stretch"?: string | null,"title"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "category"?: string | null,"chest_basis"?: string | null,"chest_cm"?: number | null,"cleared"?: (string)[],"created_at"?: string,"length_cm"?: number | null,"listing_id"?: string,"shoulder_cm"?: number | null,"size_label"?: string | null,"sleeve_cm"?: number | null,"stretch"?: string | null,"title"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "listing_overrides_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    }
                  ]
                },"listings": {
                  Row: {
                    "canonical_url": string,"condition": string | null,"content_hash": string | null,"created_at": string,"currency": string | null,"fetched_at": string | null,"id": string,"image_urls": (string)[],"is_demo": boolean,"marketplace": string,"price": number | null,"retention_until": string | null,"seller_rating": number | null,"size_label": string | null,"title": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "canonical_url": string,"condition"?: string | null,"content_hash"?: string | null,"created_at"?: string,"currency"?: string | null,"fetched_at"?: string | null,"id"?: string,"image_urls"?: (string)[],"is_demo"?: boolean,"marketplace": string,"price"?: number | null,"retention_until"?: string | null,"seller_rating"?: number | null,"size_label"?: string | null,"title"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "canonical_url"?: string,"condition"?: string | null,"content_hash"?: string | null,"created_at"?: string,"currency"?: string | null,"fetched_at"?: string | null,"id"?: string,"image_urls"?: (string)[],"is_demo"?: boolean,"marketplace"?: string,"price"?: number | null,"retention_until"?: string | null,"seller_rating"?: number | null,"size_label"?: string | null,"title"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"price_observations": {
                  Row: {
                    "currency": string,"id": number,"listing_id": string,"observed_at": string,"price": number
                  }
                  ComputedFields: never
                  Insert: {
                    "currency": string,"id"?: never,"listing_id": string,"observed_at"?: string,"price": number
                  }
                  Update: {
                    "currency"?: string,"id"?: never,"listing_id"?: string,"observed_at"?: string,"price"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "price_observations_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    }
                  ]
                },"purchases": {
                  Row: {
                    "category": string,"engine_version": string,"id": string,"inputs_hash": string,"listing_id": string | null,"listing_title": string | null,"listing_url": string | null,"marketplace": string,"prediction": NonNullable<Json>,"purchased_at": string,"size_label": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category": string,"engine_version": string,"id"?: string,"inputs_hash": string,"listing_id"?: string | null,"listing_title"?: string | null,"listing_url"?: string | null,"marketplace": string,"prediction": NonNullable<Json>,"purchased_at"?: string,"size_label"?: string | null,"user_id": string
                  }
                  Update: {
                    "category"?: string,"engine_version"?: string,"id"?: string,"inputs_hash"?: string,"listing_id"?: string | null,"listing_title"?: string | null,"listing_url"?: string | null,"marketplace"?: string,"prediction"?: NonNullable<Json>,"purchased_at"?: string,"size_label"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "purchases_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    }
                  ]
                },"reference_garments": {
                  Row: {
                    "category": string,"chest_basis": string,"chest_cm": number | null,"created_at": string,"fit_zone": string,"id": string,"length_cm": number | null,"shoulder_cm": number | null,"size_label": string | null,"sleeve_cm": number | null,"stretch": string,"title": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category": string,"chest_basis"?: string,"chest_cm"?: number | null,"created_at"?: string,"fit_zone": string,"id"?: string,"length_cm"?: number | null,"shoulder_cm"?: number | null,"size_label"?: string | null,"sleeve_cm"?: number | null,"stretch"?: string,"title": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "category"?: string,"chest_basis"?: string,"chest_cm"?: number | null,"created_at"?: string,"fit_zone"?: string,"id"?: string,"length_cm"?: number | null,"shoulder_cm"?: number | null,"size_label"?: string | null,"sleeve_cm"?: number | null,"stretch"?: string,"title"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"saved_listings": {
                  Row: {
                    "created_at": string,"listing_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"listing_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"listing_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "saved_listings_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    }
                  ]
                },"size_charts": {
                  Row: {
                    "brand": string | null,"chest_basis": string,"created_at": string,"extractor_version": string,"id": string,"listing_id": string,"rows": NonNullable<Json>,"source": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "brand"?: string | null,"chest_basis": string,"created_at"?: string,"extractor_version": string,"id"?: string,"listing_id": string,"rows": NonNullable<Json>,"source": string,"updated_at"?: string
                  }
                  Update: {
                    "brand"?: string | null,"chest_basis"?: string,"created_at"?: string,"extractor_version"?: string,"id"?: string,"listing_id"?: string,"rows"?: NonNullable<Json>,"source"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "size_charts_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: true
      referencedRelation: "listings"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "has_current_consent":
{ Args: { "p_scope": string }; Returns: boolean
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
