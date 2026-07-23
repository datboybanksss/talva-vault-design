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
      admin_notification_dismissals: {
        Row: {
          dismissed_at: string
          kind: string
          snapshot: number
          user_id: string
        }
        Insert: {
          dismissed_at?: string
          kind: string
          snapshot: number
          user_id: string
        }
        Update: {
          dismissed_at?: string
          kind?: string
          snapshot?: number
          user_id?: string
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
          accent_color: string
          billing_address: string | null
          business_type: string | null
          contact_email: string | null
          contact_person: string | null
          country: string | null
          created_at: string
          created_by: string | null
          default_invoice_payment_days: number
          default_quote_acceptance_days: number
          default_quote_reminder_days: number
          default_vat_rate_bp: number
          id: string
          invoice_overdue_grace_days: number
          is_vat_registered: boolean
          logo_path: string | null
          main_contact_email: string | null
          main_contact_first_name: string | null
          main_contact_last_name: string | null
          main_contact_phone: string | null
          name: string
          notes: string | null
          phone: string | null
          status: Database["public"]["Enums"]["agency_status"]
          suspended_at: string | null
          suspended_by: string | null
          suspension_reason: string | null
          updated_at: string
          vat_number: string | null
        }
        Insert: {
          accent_color?: string
          billing_address?: string | null
          business_type?: string | null
          contact_email?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          default_invoice_payment_days?: number
          default_quote_acceptance_days?: number
          default_quote_reminder_days?: number
          default_vat_rate_bp?: number
          id?: string
          invoice_overdue_grace_days?: number
          is_vat_registered?: boolean
          logo_path?: string | null
          main_contact_email?: string | null
          main_contact_first_name?: string | null
          main_contact_last_name?: string | null
          main_contact_phone?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["agency_status"]
          suspended_at?: string | null
          suspended_by?: string | null
          suspension_reason?: string | null
          updated_at?: string
          vat_number?: string | null
        }
        Update: {
          accent_color?: string
          billing_address?: string | null
          business_type?: string | null
          contact_email?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          default_invoice_payment_days?: number
          default_quote_acceptance_days?: number
          default_quote_reminder_days?: number
          default_vat_rate_bp?: number
          id?: string
          invoice_overdue_grace_days?: number
          is_vat_registered?: boolean
          logo_path?: string | null
          main_contact_email?: string | null
          main_contact_first_name?: string | null
          main_contact_last_name?: string | null
          main_contact_phone?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["agency_status"]
          suspended_at?: string | null
          suspended_by?: string | null
          suspension_reason?: string | null
          updated_at?: string
          vat_number?: string | null
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
          ip_address: string | null
          target_id: string | null
          target_label: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          agency_id: string
          created_at?: string
          detail?: Json
          id?: string
          ip_address?: string | null
          target_id?: string | null
          target_label?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          agency_id?: string
          created_at?: string
          detail?: Json
          id?: string
          ip_address?: string | null
          target_id?: string | null
          target_label?: string | null
          target_type?: string | null
          user_agent?: string | null
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
      agency_billing_counters: {
        Row: {
          agency_id: string
          kind: string
          next_value: number
          updated_at: string
          year: number
        }
        Insert: {
          agency_id: string
          kind: string
          next_value?: number
          updated_at?: string
          year: number
        }
        Update: {
          agency_id?: string
          kind?: string
          next_value?: number
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "agency_billing_counters_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_billing_doc_lines: {
        Row: {
          created_at: string
          description: string
          doc_id: string
          id: string
          quantity: number
          sort_order: number
          unit_price_cents: number
          updated_at: string
          vat_rate_bp: number
        }
        Insert: {
          created_at?: string
          description?: string
          doc_id: string
          id?: string
          quantity?: number
          sort_order?: number
          unit_price_cents?: number
          updated_at?: string
          vat_rate_bp?: number
        }
        Update: {
          created_at?: string
          description?: string
          doc_id?: string
          id?: string
          quantity?: number
          sort_order?: number
          unit_price_cents?: number
          updated_at?: string
          vat_rate_bp?: number
        }
        Relationships: [
          {
            foreignKeyName: "agency_billing_doc_lines_doc_id_fkey"
            columns: ["doc_id"]
            isOneToOne: false
            referencedRelation: "agency_billing_docs"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_billing_docs: {
        Row: {
          acceptance_window_days: number | null
          accepted_at: string | null
          agency_id: string
          allow_partial_payment: boolean
          client_name: string | null
          contract_document_id: string | null
          converted_from_quote_id: string | null
          created_at: string
          currency: string
          description: string | null
          due_date: string | null
          id: string
          is_vat_invoice: boolean
          issued_at: string
          kind: Database["public"]["Enums"]["doc_kind"]
          notes: string | null
          number: string
          paid_at: string | null
          payment_terms_days: number | null
          recipient_address: string | null
          recipient_email: string | null
          recipient_vat_number: string | null
          sent_at: string | null
          shared_with_talent: boolean
          status: Database["public"]["Enums"]["doc_status"]
          subtotal_cents: number
          talent_name: string | null
          total_cents: number
          updated_at: string
          vat_cents: number
          vat_rate_bp: number
        }
        Insert: {
          acceptance_window_days?: number | null
          accepted_at?: string | null
          agency_id: string
          allow_partial_payment?: boolean
          client_name?: string | null
          contract_document_id?: string | null
          converted_from_quote_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_vat_invoice?: boolean
          issued_at?: string
          kind: Database["public"]["Enums"]["doc_kind"]
          notes?: string | null
          number: string
          paid_at?: string | null
          payment_terms_days?: number | null
          recipient_address?: string | null
          recipient_email?: string | null
          recipient_vat_number?: string | null
          sent_at?: string | null
          shared_with_talent?: boolean
          status?: Database["public"]["Enums"]["doc_status"]
          subtotal_cents?: number
          talent_name?: string | null
          total_cents?: number
          updated_at?: string
          vat_cents?: number
          vat_rate_bp?: number
        }
        Update: {
          acceptance_window_days?: number | null
          accepted_at?: string | null
          agency_id?: string
          allow_partial_payment?: boolean
          client_name?: string | null
          contract_document_id?: string | null
          converted_from_quote_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_vat_invoice?: boolean
          issued_at?: string
          kind?: Database["public"]["Enums"]["doc_kind"]
          notes?: string | null
          number?: string
          paid_at?: string | null
          payment_terms_days?: number | null
          recipient_address?: string | null
          recipient_email?: string | null
          recipient_vat_number?: string | null
          sent_at?: string | null
          shared_with_talent?: boolean
          status?: Database["public"]["Enums"]["doc_status"]
          subtotal_cents?: number
          talent_name?: string | null
          total_cents?: number
          updated_at?: string
          vat_cents?: number
          vat_rate_bp?: number
        }
        Relationships: [
          {
            foreignKeyName: "agency_billing_docs_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_billing_docs_contract_document_id_fkey"
            columns: ["contract_document_id"]
            isOneToOne: false
            referencedRelation: "talent_shared_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_billing_docs_converted_from_quote_id_fkey"
            columns: ["converted_from_quote_id"]
            isOneToOne: false
            referencedRelation: "agency_billing_docs"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_compliance_documents: {
        Row: {
          agency_id: string | null
          business_type: string
          created_at: string
          doc_slot: string
          file_name: string
          id: string
          invitation_id: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          agency_id?: string | null
          business_type: string
          created_at?: string
          doc_slot: string
          file_name: string
          id?: string
          invitation_id: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
          uploaded_by: string
        }
        Update: {
          agency_id?: string | null
          business_type?: string
          created_at?: string
          doc_slot?: string
          file_name?: string
          id?: string
          invitation_id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_compliance_documents_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_compliance_documents_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "agency_invitations"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_document_request_history: {
        Row: {
          actor_email: string | null
          actor_id: string | null
          agency_id: string
          created_at: string
          document_id: string | null
          event: string
          id: string
          notes: string | null
          reason_code: string | null
          request_id: string
        }
        Insert: {
          actor_email?: string | null
          actor_id?: string | null
          agency_id: string
          created_at?: string
          document_id?: string | null
          event: string
          id?: string
          notes?: string | null
          reason_code?: string | null
          request_id: string
        }
        Update: {
          actor_email?: string | null
          actor_id?: string | null
          agency_id?: string
          created_at?: string
          document_id?: string | null
          event?: string
          id?: string
          notes?: string | null
          reason_code?: string | null
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_document_request_history_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_document_request_history_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "talent_shared_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_document_request_history_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "agency_document_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_document_requests: {
        Row: {
          agency_id: string
          created_at: string
          current_document_id: string | null
          due_date: string | null
          folder: string
          id: string
          instructions: string | null
          reason_code: string | null
          requested_by: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["doc_request_status"]
          talent_link_id: string
          title: string
          updated_at: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          current_document_id?: string | null
          due_date?: string | null
          folder: string
          id?: string
          instructions?: string | null
          reason_code?: string | null
          requested_by?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["doc_request_status"]
          talent_link_id: string
          title: string
          updated_at?: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          current_document_id?: string | null
          due_date?: string | null
          folder?: string
          id?: string
          instructions?: string | null
          reason_code?: string | null
          requested_by?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["doc_request_status"]
          talent_link_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_document_requests_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_document_requests_current_document_id_fkey"
            columns: ["current_document_id"]
            isOneToOne: false
            referencedRelation: "talent_shared_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_document_requests_talent_link_id_fkey"
            columns: ["talent_link_id"]
            isOneToOne: false
            referencedRelation: "agency_talent_links"
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
          business_type: string | null
          contact_person: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          kind: Database["public"]["Enums"]["agency_invitation_kind"]
          last_sent_at: string
          registered_contact_number: string | null
          registered_mobile_number: string | null
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
          business_type?: string | null
          contact_person?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          kind?: Database["public"]["Enums"]["agency_invitation_kind"]
          last_sent_at?: string
          registered_contact_number?: string | null
          registered_mobile_number?: string | null
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
          business_type?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          kind?: Database["public"]["Enums"]["agency_invitation_kind"]
          last_sent_at?: string
          registered_contact_number?: string | null
          registered_mobile_number?: string | null
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
      agency_talent_folders: {
        Row: {
          agency_id: string
          created_at: string
          folder_name: string
          id: string
          retention_years: number | null
          sort_order: number
          talent_link_id: string
          updated_at: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          folder_name: string
          id?: string
          retention_years?: number | null
          sort_order?: number
          talent_link_id: string
          updated_at?: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          folder_name?: string
          id?: string
          retention_years?: number | null
          sort_order?: number
          talent_link_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_talent_folders_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_talent_folders_talent_link_id_fkey"
            columns: ["talent_link_id"]
            isOneToOne: false
            referencedRelation: "agency_talent_links"
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
          folder_mode: string
          folder_selection: Json
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
          folder_mode?: string
          folder_selection?: Json
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
          folder_mode?: string
          folder_selection?: Json
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
          contract_client_name: string | null
          contract_currency: string | null
          contract_end_date: string | null
          contract_notes: string | null
          contract_start_date: string | null
          contract_total_cents: number | null
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
          contract_client_name?: string | null
          contract_currency?: string | null
          contract_end_date?: string | null
          contract_notes?: string | null
          contract_start_date?: string | null
          contract_total_cents?: number | null
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
          contract_client_name?: string | null
          contract_currency?: string | null
          contract_end_date?: string | null
          contract_notes?: string | null
          contract_start_date?: string | null
          contract_total_cents?: number | null
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
      accept_talent_invitation: {
        Args: { _email: string; _invitation_id: string; _user_id: string }
        Returns: string
      }
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
      mint_billing_doc_number: {
        Args: { _agency_id: string; _kind: string }
        Returns: string
      }
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
      doc_request_status:
        | "pending"
        | "submitted"
        | "completed"
        | "resubmission_required"
        | "cancelled"
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
        | "draft"
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
      doc_request_status: [
        "pending",
        "submitted",
        "completed",
        "resubmission_required",
        "cancelled",
      ],
      doc_status: ["draft", "sent", "accepted", "paid", "overdue", "cancelled"],
      invitation_status: [
        "pending",
        "accepted",
        "expired",
        "declined",
        "revoked",
        "draft",
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
