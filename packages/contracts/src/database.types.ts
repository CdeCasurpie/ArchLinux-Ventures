export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      adjunto: {
        Row: {
          archivo_id: string
          created_at: string
          descripcion: string | null
          expediente_id: string
          id: string
          incluir_en_informe: boolean
          orden: number
          tipo: Database["public"]["Enums"]["tipo_adjunto"]
          titulo: string
          visita_id: string | null
        }
        Insert: {
          archivo_id: string
          created_at?: string
          descripcion?: string | null
          expediente_id: string
          id?: string
          incluir_en_informe?: boolean
          orden: number
          tipo: Database["public"]["Enums"]["tipo_adjunto"]
          titulo: string
          visita_id?: string | null
        }
        Update: {
          archivo_id?: string
          created_at?: string
          descripcion?: string | null
          expediente_id?: string
          id?: string
          incluir_en_informe?: boolean
          orden?: number
          tipo?: Database["public"]["Enums"]["tipo_adjunto"]
          titulo?: string
          visita_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "adjunto_archivo_id_fkey"
            columns: ["archivo_id"]
            isOneToOne: false
            referencedRelation: "archivo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adjunto_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "expediente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adjunto_visita_id_expediente_id_fkey"
            columns: ["visita_id", "expediente_id"]
            isOneToOne: false
            referencedRelation: "visita"
            referencedColumns: ["id", "expediente_id"]
          },
          {
            foreignKeyName: "adjunto_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "visita"
            referencedColumns: ["id"]
          },
        ]
      }
      archivo: {
        Row: {
          checksum_sha256: string | null
          created_at: string
          estado_sincronizacion: Database["public"]["Enums"]["estado_sincronizacion"]
          id: string
          local_uri: string | null
          mime_type: string
          nombre_original: string | null
          profesional_id: string
          sincronizado_at: string | null
          storage_key: string | null
          tamanio_bytes: number | null
          tipo: Database["public"]["Enums"]["tipo_archivo"]
        }
        Insert: {
          checksum_sha256?: string | null
          created_at?: string
          estado_sincronizacion?: Database["public"]["Enums"]["estado_sincronizacion"]
          id?: string
          local_uri?: string | null
          mime_type: string
          nombre_original?: string | null
          profesional_id: string
          sincronizado_at?: string | null
          storage_key?: string | null
          tamanio_bytes?: number | null
          tipo: Database["public"]["Enums"]["tipo_archivo"]
        }
        Update: {
          checksum_sha256?: string | null
          created_at?: string
          estado_sincronizacion?: Database["public"]["Enums"]["estado_sincronizacion"]
          id?: string
          local_uri?: string | null
          mime_type?: string
          nombre_original?: string | null
          profesional_id?: string
          sincronizado_at?: string | null
          storage_key?: string | null
          tamanio_bytes?: number | null
          tipo?: Database["public"]["Enums"]["tipo_archivo"]
        }
        Relationships: [
          {
            foreignKeyName: "archivo_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "profesional"
            referencedColumns: ["id"]
          },
        ]
      }
      expediente: {
        Row: {
          activo: boolean
          checklist_esquema_json: Json
          checklist_nombre: string
          created_at: string
          datos_cabecera_extra: Json | null
          departamento: string | null
          detalle_obra: string | null
          distrito: string | null
          entidad_destinataria: string | null
          fecha_emision_licencia: string | null
          id: string
          modalidad: string | null
          nro_expediente: string
          nro_licencia: string | null
          poliza_car_json: Json | null
          profesional_id: string
          propietario: string | null
          provincia: string | null
          responsable_obra_colegiatura: string | null
          responsable_obra_nombre: string | null
          tipo_obra: string | null
          total_visitas_programadas: number | null
          ubicacion: string
          updated_at: string
          uso_predio: string | null
          valor_obra: number | null
          vigencia_desde: string | null
          vigencia_hasta: string | null
        }
        Insert: {
          activo?: boolean
          checklist_esquema_json: Json
          checklist_nombre: string
          created_at?: string
          datos_cabecera_extra?: Json | null
          departamento?: string | null
          detalle_obra?: string | null
          distrito?: string | null
          entidad_destinataria?: string | null
          fecha_emision_licencia?: string | null
          id?: string
          modalidad?: string | null
          nro_expediente: string
          nro_licencia?: string | null
          poliza_car_json?: Json | null
          profesional_id: string
          propietario?: string | null
          provincia?: string | null
          responsable_obra_colegiatura?: string | null
          responsable_obra_nombre?: string | null
          tipo_obra?: string | null
          total_visitas_programadas?: number | null
          ubicacion: string
          updated_at?: string
          uso_predio?: string | null
          valor_obra?: number | null
          vigencia_desde?: string | null
          vigencia_hasta?: string | null
        }
        Update: {
          activo?: boolean
          checklist_esquema_json?: Json
          checklist_nombre?: string
          created_at?: string
          datos_cabecera_extra?: Json | null
          departamento?: string | null
          detalle_obra?: string | null
          distrito?: string | null
          entidad_destinataria?: string | null
          fecha_emision_licencia?: string | null
          id?: string
          modalidad?: string | null
          nro_expediente?: string
          nro_licencia?: string | null
          poliza_car_json?: Json | null
          profesional_id?: string
          propietario?: string | null
          provincia?: string | null
          responsable_obra_colegiatura?: string | null
          responsable_obra_nombre?: string | null
          tipo_obra?: string | null
          total_visitas_programadas?: number | null
          ubicacion?: string
          updated_at?: string
          uso_predio?: string | null
          valor_obra?: number | null
          vigencia_desde?: string | null
          vigencia_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expediente_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "profesional"
            referencedColumns: ["id"]
          },
        ]
      }
      firmante_visita: {
        Row: {
          cargo_impreso: string | null
          colegiatura_impresa: string | null
          created_at: string
          firma_archivo_id: string | null
          id: string
          nombre_impreso: string
          orden: number
          profesional_id: string | null
          repetir_en_pie_pagina: boolean
          rol: string
          visita_id: string
        }
        Insert: {
          cargo_impreso?: string | null
          colegiatura_impresa?: string | null
          created_at?: string
          firma_archivo_id?: string | null
          id?: string
          nombre_impreso: string
          orden: number
          profesional_id?: string | null
          repetir_en_pie_pagina?: boolean
          rol: string
          visita_id: string
        }
        Update: {
          cargo_impreso?: string | null
          colegiatura_impresa?: string | null
          created_at?: string
          firma_archivo_id?: string | null
          id?: string
          nombre_impreso?: string
          orden?: number
          profesional_id?: string | null
          repetir_en_pie_pagina?: boolean
          rol?: string
          visita_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "firmante_visita_firma_archivo_id_fkey"
            columns: ["firma_archivo_id"]
            isOneToOne: false
            referencedRelation: "archivo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firmante_visita_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "profesional"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firmante_visita_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "visita"
            referencedColumns: ["id"]
          },
        ]
      }
      foto: {
        Row: {
          archivo_id: string
          capturada_at: string
          created_at: string
          grupo_captura_id: string | null
          hash_perceptual: string | null
          id: string
          latitud: number | null
          longitud: number | null
          orden_captura: number
          orden_en_grupo: number | null
          seleccionada_para_informe: boolean
          visita_id: string
        }
        Insert: {
          archivo_id: string
          capturada_at: string
          created_at?: string
          grupo_captura_id?: string | null
          hash_perceptual?: string | null
          id?: string
          latitud?: number | null
          longitud?: number | null
          orden_captura: number
          orden_en_grupo?: number | null
          seleccionada_para_informe?: boolean
          visita_id: string
        }
        Update: {
          archivo_id?: string
          capturada_at?: string
          created_at?: string
          grupo_captura_id?: string | null
          hash_perceptual?: string | null
          id?: string
          latitud?: number | null
          longitud?: number | null
          orden_captura?: number
          orden_en_grupo?: number | null
          seleccionada_para_informe?: boolean
          visita_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "foto_archivo_id_fkey"
            columns: ["archivo_id"]
            isOneToOne: true
            referencedRelation: "archivo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "foto_grupo_captura_id_fkey"
            columns: ["grupo_captura_id"]
            isOneToOne: false
            referencedRelation: "grupo_captura"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "foto_grupo_captura_id_visita_id_fkey"
            columns: ["grupo_captura_id", "visita_id"]
            isOneToOne: false
            referencedRelation: "grupo_captura"
            referencedColumns: ["id", "visita_id"]
          },
          {
            foreignKeyName: "foto_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "visita"
            referencedColumns: ["id"]
          },
        ]
      }
      grupo_captura: {
        Row: {
          audio_archivo_id: string | null
          audio_duracion_ms: number | null
          comentario_editado: string | null
          confirmado_at: string | null
          created_at: string
          estado: Database["public"]["Enums"]["estado_grupo_captura"]
          id: string
          iniciado_at: string
          orden: number
          transcripcion_original: string | null
          transcripcion_parcial: string | null
          updated_at: string
          visita_id: string
        }
        Insert: {
          audio_archivo_id?: string | null
          audio_duracion_ms?: number | null
          comentario_editado?: string | null
          confirmado_at?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["estado_grupo_captura"]
          id?: string
          iniciado_at: string
          orden: number
          transcripcion_original?: string | null
          transcripcion_parcial?: string | null
          updated_at?: string
          visita_id: string
        }
        Update: {
          audio_archivo_id?: string | null
          audio_duracion_ms?: number | null
          comentario_editado?: string | null
          confirmado_at?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["estado_grupo_captura"]
          id?: string
          iniciado_at?: string
          orden?: number
          transcripcion_original?: string | null
          transcripcion_parcial?: string | null
          updated_at?: string
          visita_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grupo_captura_audio_archivo_id_fkey"
            columns: ["audio_archivo_id"]
            isOneToOne: false
            referencedRelation: "archivo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grupo_captura_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "visita"
            referencedColumns: ["id"]
          },
        ]
      }
      plantilla_checklist: {
        Row: {
          activa: boolean
          codigo: string
          created_at: string
          esquema_json: Json
          id: string
          nombre: string
          profesional_id: string | null
          version: number
        }
        Insert: {
          activa?: boolean
          codigo: string
          created_at?: string
          esquema_json: Json
          id?: string
          nombre: string
          profesional_id?: string | null
          version: number
        }
        Update: {
          activa?: boolean
          codigo?: string
          created_at?: string
          esquema_json?: Json
          id?: string
          nombre?: string
          profesional_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "plantilla_checklist_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "profesional"
            referencedColumns: ["id"]
          },
        ]
      }
      profesional: {
        Row: {
          activo: boolean
          cargo: string | null
          created_at: string
          email: string
          firma_archivo_id: string | null
          id: string
          nombre_completo: string
          nro_colegiatura: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          cargo?: string | null
          created_at?: string
          email: string
          firma_archivo_id?: string | null
          id?: string
          nombre_completo: string
          nro_colegiatura?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          cargo?: string | null
          created_at?: string
          email?: string
          firma_archivo_id?: string | null
          id?: string
          nombre_completo?: string
          nro_colegiatura?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profesional_firma_archivo_id_fkey"
            columns: ["firma_archivo_id"]
            isOneToOne: false
            referencedRelation: "archivo"
            referencedColumns: ["id"]
          },
        ]
      }
      visita: {
        Row: {
          asiento_cuaderno_obra: string | null
          avance_general: number | null
          calificacion: string | null
          checklist_completado: boolean
          checklist_esquema_json: Json
          checklist_nombre: string
          checklist_respuestas_json: Json
          codigo_informe: string | null
          conclusiones_audio_archivo_id: string | null
          conclusiones_texto: string | null
          conclusiones_transcripcion: string | null
          created_at: string
          documento_json: Json
          estado: Database["public"]["Enums"]["estado_visita"]
          estado_documento: Database["public"]["Enums"]["estado_documento"]
          expediente_id: string
          fecha: string
          fecha_entrega_residente: string | null
          generado_at: string | null
          hora_fin: string | null
          hora_inicio: string | null
          id: string
          nivel_riesgo: string | null
          nro_visita: number
          pdf_archivo_id: string | null
          proxima_visita_fecha: string | null
          responsable_obra_colegiatura: string | null
          responsable_obra_nombre: string | null
          updated_at: string
        }
        Insert: {
          asiento_cuaderno_obra?: string | null
          avance_general?: number | null
          calificacion?: string | null
          checklist_completado?: boolean
          checklist_esquema_json: Json
          checklist_nombre: string
          checklist_respuestas_json: Json
          codigo_informe?: string | null
          conclusiones_audio_archivo_id?: string | null
          conclusiones_texto?: string | null
          conclusiones_transcripcion?: string | null
          created_at?: string
          documento_json: Json
          estado?: Database["public"]["Enums"]["estado_visita"]
          estado_documento?: Database["public"]["Enums"]["estado_documento"]
          expediente_id: string
          fecha: string
          fecha_entrega_residente?: string | null
          generado_at?: string | null
          hora_fin?: string | null
          hora_inicio?: string | null
          id?: string
          nivel_riesgo?: string | null
          nro_visita: number
          pdf_archivo_id?: string | null
          proxima_visita_fecha?: string | null
          responsable_obra_colegiatura?: string | null
          responsable_obra_nombre?: string | null
          updated_at?: string
        }
        Update: {
          asiento_cuaderno_obra?: string | null
          avance_general?: number | null
          calificacion?: string | null
          checklist_completado?: boolean
          checklist_esquema_json?: Json
          checklist_nombre?: string
          checklist_respuestas_json?: Json
          codigo_informe?: string | null
          conclusiones_audio_archivo_id?: string | null
          conclusiones_texto?: string | null
          conclusiones_transcripcion?: string | null
          created_at?: string
          documento_json?: Json
          estado?: Database["public"]["Enums"]["estado_visita"]
          estado_documento?: Database["public"]["Enums"]["estado_documento"]
          expediente_id?: string
          fecha?: string
          fecha_entrega_residente?: string | null
          generado_at?: string | null
          hora_fin?: string | null
          hora_inicio?: string | null
          id?: string
          nivel_riesgo?: string | null
          nro_visita?: number
          pdf_archivo_id?: string | null
          proxima_visita_fecha?: string | null
          responsable_obra_colegiatura?: string | null
          responsable_obra_nombre?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "visita_conclusiones_audio_archivo_id_fkey"
            columns: ["conclusiones_audio_archivo_id"]
            isOneToOne: false
            referencedRelation: "archivo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visita_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "expediente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visita_pdf_archivo_id_fkey"
            columns: ["pdf_archivo_id"]
            isOneToOne: false
            referencedRelation: "archivo"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      owns_archivo: { Args: { target: string }; Returns: boolean }
      owns_expediente: { Args: { target: string }; Returns: boolean }
      owns_visita: { Args: { target: string }; Returns: boolean }
      sync_profesional: {
        Args: {
          base_updated_at: string
          cargo_nuevo: string
          colegiatura: string
          nombre: string
        }
        Returns: {
          activo: boolean
          cargo: string | null
          created_at: string
          email: string
          firma_archivo_id: string | null
          id: string
          nombre_completo: string
          nro_colegiatura: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profesional"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      estado_documento: "BORRADOR" | "GENERADO"
      estado_grupo_captura:
        | "ABIERTO"
        | "GRABANDO"
        | "PENDIENTE_CONFIRMACION"
        | "CONFIRMADO"
      estado_sincronizacion: "LOCAL" | "PENDIENTE" | "SINCRONIZADO" | "ERROR"
      estado_visita:
        | "BORRADOR"
        | "EN_CAMPO"
        | "EN_REVISION"
        | "FINALIZADA"
        | "ARCHIVADA"
      tipo_adjunto: "CUADERNO_OBRA" | "POLIZA" | "PLANO" | "ACTA" | "OTRO"
      tipo_archivo: "IMAGEN" | "AUDIO" | "DOCUMENTO" | "PDF"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      estado_documento: ["BORRADOR", "GENERADO"],
      estado_grupo_captura: [
        "ABIERTO",
        "GRABANDO",
        "PENDIENTE_CONFIRMACION",
        "CONFIRMADO",
      ],
      estado_sincronizacion: ["LOCAL", "PENDIENTE", "SINCRONIZADO", "ERROR"],
      estado_visita: [
        "BORRADOR",
        "EN_CAMPO",
        "EN_REVISION",
        "FINALIZADA",
        "ARCHIVADA",
      ],
      tipo_adjunto: ["CUADERNO_OBRA", "POLIZA", "PLANO", "ACTA", "OTRO"],
      tipo_archivo: ["IMAGEN", "AUDIO", "DOCUMENTO", "PDF"],
    },
  },
} as const
