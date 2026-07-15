export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          detail: Json | null
          id: string
          target_id: string | null
          target_label: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          detail?: Json | null
          id?: string
          target_id?: string | null
          target_label?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          detail?: Json | null
          id?: string
          target_id?: string | null
          target_label?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      admin_invitations: {
        Row: {
          accepted_at: string | null
          accepted_user_id: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          invited_by_email: string | null
          permission_level: Database["public"]["Enums"]["admin_permission_level"]
          revoked_at: string | null
          revoked_by: string | null
          status: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          invited_by_email?: string | null
          permission_level?: Database["public"]["Enums"]["admin_permission_level"]
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          invited_by_email?: string | null
          permission_level?: Database["public"]["Enums"]["admin_permission_level"]
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
        }
        Relationships: []
      }
      admin_notifications: {
        Row: {
          created_at: string
          detail: string | null
          dismissed_at: string | null
          dismissed_by: string | null
          id: string
          kind: Database["public"]["Enums"]["notif_kind"]
          target_id: string | null
          target_type: string | null
          title: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          dismissed_at?: string | null
          dismissed_by?: string | null
          id?: string
          kind: Database["public"]["Enums"]["notif_kind"]
          target_id?: string | null
          target_type?: string | null
          title: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          dismissed_at?: string | null
          dismissed_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["notif_kind"]
          target_id?: string | null
          target_type?: string | null
          title?: string
        }
        Relationships: []
      }
      agencies: {
        Row: {
          contact_email: string | null
          contact_person: string | null
          country: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          status: Database["public"]["Enums"]["agency_status"]
          suspended_at: string | null
          suspended_by: string | null
          suspension_reason: string | null
          updated_at: string
        }
        Insert: {
          contact_email?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["agency_status"]
          suspended_at?: string | null
          suspended_by?: string | null
          suspension_reason?: string | null
          updated_at?: string
        }
        Update: {
          contact_email?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["agency_status"]
          suspended_at?: string | null
          suspended_by?: string | null
          suspension_reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      agency_audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          agency_id: string
          created_at: string
          detail: Json
          id: string
          target_id: string | null
          target_label: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          agency_id: string
          created_at?: string
          detail?: Json
          id?: string
          target_id?: string | null
          target_label?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          agency_id?: string
          created_at?: string
          detail?: Json
          id?: string
          target_id?: string | null
          target_label?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agency_audit_log_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_billing_docs: {
        Row: {
          agency_id: string
          client_name: string | null
          created_at: string
          currency: string
          due_date: string | null
          id: string
          issued_at: string
          kind: Database["public"]["Enums"]["doc_kind"]
          notes: string | null
          number: string
          status: Database["public"]["Enums"]["doc_status"]
          talent_name: string | null
          total_cents: number
          updated_at: string
        }
        Insert: {
          agency_id: string
          client_name?: string | null
          created_at?: string
          currency?: string
          due_date?: string | null
          id?: string
          issued_at?: string
          kind: Database["public"]["Enums"]["doc_kind"]
          notes?: string | null
          number: string
          status?: Database["public"]["Enums"]["doc_status"]
          talent_name?: string | null
          total_cents?: number
          updated_at?: string
        }
        Update: {
          agency_id?: string
          client_name?: string | null
          created_at?: string
          currency?: string
          due_date?: string | null
          id?: string
          issued_at?: string
          kind?: Database["public"]["Enums"]["doc_kind"]
          notes?: string | null
          number?: string
          status?: Database["public"]["Enums"]["doc_status"]
          talent_name?: string | null
          total_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_billing_docs_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_documents: {
        Row: {
          agency_id: string
          id: string
          private_vault_count: number
          shared_folder_count: number
          updated_at: string
        }
        Insert: {
          agency_id: string
          id?: string
          private_vault_count?: number
          shared_folder_count?: number
          updated_at?: string
        }
        Update: {
          agency_id?: string
          id?: string
          private_vault_count?: number
          shared_folder_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_documents_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: true
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_folder_template_items: {
        Row: {
          created_at: string
          default_retention_years: number | null
          folder_name: string
          id: string
          required_docs: Json
          sort_order: number
          template_id: string
        }
        Insert: {
          created_at?: string
          default_retention_years?: number | null
          folder_name: string
          id?: string
          required_docs?: Json
          sort_order?: number
          template_id: string
        }
        Update: {
          created_at?: string
          default_retention_years?: number | null
          folder_name?: string
          id?: string
          required_docs?: Json
          sort_order?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_folder_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "agency_folder_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_folder_templates: {
        Row: {
          agency_id: string
          created_at: string
          description: string | null
          id: string
          is_default: boolean
          name: string
          updated_at: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_folder_templates_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_invitations: {
        Row: {
          accepted_at: string | null
          agency_id: string | null
          agency_name: string
          contact_person: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          kind: Database["public"]["Enums"]["agency_invitation_kind"]
          last_sent_at: string
          role: string | null
          send_count: number
          status: Database["public"]["Enums"]["invitation_status"]
          supporting_docs: Json | null
          token: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          agency_id?: string | null
          agency_name: string
          contact_person?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          kind?: Database["public"]["Enums"]["agency_invitation_kind"]
          last_sent_at?: string
          role?: string | null
          send_count?: number
          status?: Database["public"]["Enums"]["invitation_status"]
          supporting_docs?: Json | null
          token?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          agency_id?: string | null
          agency_name?: string
          contact_person?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          kind?: Database["public"]["Enums"]["agency_invitation_kind"]
          last_sent_at?: string
          role?: string | null
          send_count?: number
          status?: Database["public"]["Enums"]["invitation_status"]
          supporting_docs?: Json | null
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_invitations_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_members: {
        Row: {
          agency_id: string
          created_at: string
          id: string
          role: string
          suspended: boolean
          suspended_reason: string | null
          user_id: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          id?: string
          role?: string
          suspended?: boolean
          suspended_reason?: string | null
          user_id: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          id?: string
          role?: string
          suspended?: boolean
          suspended_reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_members_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_retention_rules: {
        Row: {
          agency_id: string
          created_at: string
          created_by: string | null
          description: string | null
          document_id: string | null
          id: string
          retention_years: number
          scope: Database["public"]["Enums"]["retention_scope"]
          scope_value: string | null
          updated_at: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          document_id?: string | null
          id?: string
          retention_years: number
          scope: Database["public"]["Enums"]["retention_scope"]
          scope_value?: string | null
          updated_at?: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          document_id?: string | null
          id?: string
          retention_years?: number
          scope?: Database["public"]["Enums"]["retention_scope"]
          scope_value?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_retention_rules_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_retention_rules_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "talent_shared_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_talent_links: {
        Row: {
          agency_id: string
          created_at: string
          display_name: string
          ended_at: string | null
          ended_by: string | null
          id: string
          manager_user_id: string | null
          next_action: string | null
          status: Database["public"]["Enums"]["agency_talent_link_status"]
          talent_invitation_id: string | null
          talent_profile_id: string | null
          talent_type: string | null
          talent_user_id: string | null
          updated_at: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          display_name: string
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          manager_user_id?: string | null
          next_action?: string | null
          status?: Database["public"]["Enums"]["agency_talent_link_status"]
          talent_invitation_id?: string | null
          talent_profile_id?: string | null
          talent_type?: string | null
          talent_user_id?: string | null
          updated_at?: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          display_name?: string
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          manager_user_id?: string | null
          next_action?: string | null
          status?: Database["public"]["Enums"]["agency_talent_link_status"]
          talent_invitation_id?: string | null
          talent_profile_id?: string | null
          talent_type?: string | null
          talent_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_talent_links_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_talent_links_talent_invitation_id_fkey"
            columns: ["talent_invitation_id"]
            isOneToOne: false
            referencedRelation: "talent_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_talent_links_talent_profile_id_fkey"
            columns: ["talent_profile_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_copy_items: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          body: string | null
          id: string
          slug: string
          status: Database["public"]["Enums"]["legal_status"]
          title: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          body?: string | null
          id?: string
          slug: string
          status?: Database["public"]["Enums"]["legal_status"]
          title: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          body?: string | null
          id?: string
          slug?: string
          status?: Database["public"]["Enums"]["legal_status"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      loved_one_shares: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          loved_one_email: string
          talent_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          loved_one_email: string
          talent_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          loved_one_email?: string
          talent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loved_one_shares_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talent_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          designation: string | null
          display_name: string | null
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          terms_accepted_at: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          designation?: string | null
          display_name?: string | null
          email: string
          first_name?: string | null
          id: string
          last_name?: string | null
          phone?: string | null
          terms_accepted_at?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          designation?: string | null
          display_name?: string | null
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          terms_accepted_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      talent_invitations: {
        Row: {
          accepted_at: string | null
          agency_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          last_sent_at: string
          send_count: number
          status: Database["public"]["Enums"]["invitation_status"]
          talent_name: string | null
          token: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          agency_id: string
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          last_sent_at?: string
          send_count?: number
          status?: Database["public"]["Enums"]["invitation_status"]
          talent_name?: string | null
          token?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          agency_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          last_sent_at?: string
          send_count?: number
          status?: Database["public"]["Enums"]["invitation_status"]
          talent_name?: string | null
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_invitations_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_profiles: {
        Row: {
          agency_id: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          full_name: string
          id: string
          is_test: boolean
          user_id: string | null
        }
        Insert: {
          agency_id?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          full_name: string
          id?: string
          is_test?: boolean
          user_id?: string | null
        }
        Update: {
          agency_id?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          is_test?: boolean
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "talent_profiles_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_shared_document_versions: {
        Row: {
          created_at: string
          document_id: string
          id: string
          mime_type: string | null
          name: string
          size_bytes: number | null
          storage_path: string
          uploaded_by: string | null
          version_number: number
        }
        Insert: {
          created_at?: string
          document_id: string
          id?: string
          mime_type?: string | null
          name: string
          size_bytes?: number | null
          storage_path: string
          uploaded_by?: string | null
          version_number: number
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          mime_type?: string | null
          name?: string
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "talent_shared_document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "talent_shared_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_shared_documents: {
        Row: {
          agency_id: string
          ai_suggested_expiry: string | null
          ai_suggested_folder: string | null
          created_at: string
          current_version_id: string | null
          folder: string
          id: string
          locked_until: string | null
          name: string
          revoked_at: string | null
          status: Database["public"]["Enums"]["shared_document_status"]
          storage_path: string | null
          talent_link_id: string | null
          updated_at: string
          uploaded_by: string | null
          validity_expires_at: string | null
        }
        Insert: {
          agency_id: string
          ai_suggested_expiry?: string | null
          ai_suggested_folder?: string | null
          created_at?: string
          current_version_id?: string | null
          folder?: string
          id?: string
          locked_until?: string | null
          name: string
          revoked_at?: string | null
          status?: Database["public"]["Enums"]["shared_document_status"]
          storage_path?: string | null
          talent_link_id?: string | null
          updated_at?: string
          uploaded_by?: string | null
          validity_expires_at?: string | null
        }
        Update: {
          agency_id?: string
          ai_suggested_expiry?: string | null
          ai_suggested_folder?: string | null
          created_at?: string
          current_version_id?: string | null
          folder?: string
          id?: string
          locked_until?: string | null
          name?: string
          revoked_at?: string | null
          status?: Database["public"]["Enums"]["shared_document_status"]
          storage_path?: string | null
          talent_link_id?: string | null
          updated_at?: string
          uploaded_by?: string | null
          validity_expires_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "talent_shared_documents_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_shared_documents_talent_link_id_fkey"
            columns: ["talent_link_id"]
            isOneToOne: false
            referencedRelation: "agency_talent_links"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          is_main_admin: boolean
          permission_level: Database["public"]["Enums"]["admin_permission_level"]
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_main_admin?: boolean
          permission_level?: Database["public"]["Enums"]["admin_permission_level"]
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_main_admin?: boolean
          permission_level?: Database["public"]["Enums"]["admin_permission_level"]
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_admin_edit: { Args: { _user_id: string }; Returns: boolean }
      compute_document_locked_until: {
        Args: { _doc_id: string }
        Returns: string
      }
      current_user_agency_id: { Args: never; Returns: string }
      has_agency_role: {
        Args: { _agency_id: string; _role: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_agency_member: {
        Args: { _agency_id: string; _user_id: string }
        Returns: boolean
      }
      is_main_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      admin_permission_level: "view_only" | "edit"
      agency_invitation_kind: "agency_onboarding" | "staff"
      agency_status:
        | "incomplete"
        | "invited"
        | "accepted"
        | "expired"
        | "declined"
        | "suspended"
      agency_talent_link_status:
        | "active"
        | "invited"
        | "expired"
        | "read_only"
        | "revoked"
        | "needs_review"
        | "ended"
      app_role:
        | "admin"
        | "agency_owner"
        | "agency_member"
        | "talent"
        | "loved_one"
      doc_kind: "quote" | "invoice"
      doc_status:
        | "draft"
        | "sent"
        | "accepted"
        | "paid"
        | "overdue"
        | "cancelled"
      invitation_status:
        | "pending"
        | "accepted"
        | "expired"
        | "declined"
        | "revoked"
      legal_status: "placeholder" | "in_review" | "approved"
      notif_kind:
        | "invite_expiring"
        | "invite_expired"
        | "agency_incomplete"
        | "talent_invite_pending"
        | "suspended_review"
        | "legal_copy_review"
      retention_scope: "folder" | "document"
      shared_document_status: "ai_suggested" | "filed" | "needs_review"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      admin_permission_level: ["view_only", "edit"],
      agency_invitation_kind: ["agency_onboarding", "staff"],
      agency_status: [
        "incomplete",
        "invited",
        "accepted",
        "expired",
        "declined",
        "suspended",
      ],
      agency_talent_link_status: [
        "active",
        "invited",
        "expired",
        "read_only",
        "revoked",
        "needs_review",
        "ended",
      ],
      app_role: [
        "admin",
        "agency_owner",
        "agency_member",
        "talent",
        "loved_one",
      ],
      doc_kind: ["quote", "invoice"],
      doc_status: ["draft", "sent", "accepted", "paid", "overdue", "cancelled"],
      invitation_status: [
        "pending",
        "accepted",
        "expired",
        "declined",
        "revoked",
      ],
      legal_status: ["placeholder", "in_review", "approved"],
      notif_kind: [
        "invite_expiring",
        "invite_expired",
        "agency_incomplete",
        "talent_invite_pending",
        "suspended_review",
        "legal_copy_review",
      ],
      retention_scope: ["folder", "document"],
      shared_document_status: ["ai_suggested", "filed", "needs_review"],
    },
  },
} as const
