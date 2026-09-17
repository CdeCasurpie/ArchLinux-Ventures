# Análisis Estratégico — Microproblemas y Monetización

## La intuición: "Pagarían poco por uno, poco por muchos"

**Conclusión:** La intuición es correcta. Las entrevistas revelan un patrón de **micro-dolores distribuidos** en el flujo, no un único "killer pain" uniforme con alto willingness-to-pay individual.

### Evidencia

| Patrón | Fuente | Implicación |
|:---|:---|:---|
| Dolor varía 1h → 5h para el **mismo tipo de tarea** | Israel vs. Vicky vs. Laura | No vendes "reportes" genérico; vendes a un **sub-segmento** |
| Proyectistas senior **ya resolvieron** partes con IA | Miguel Luna (memorias), Laura (Report and Run) | Cada micro-dolor se puede cubrir con herramienta puntual → **canibalización** |
| César no sigue su propio pipeline óptimo con 10 proyectos | transcripcion.txt | El meta-problema es **gestión de contexto**, no una tarea aislada |
| Israel odia **coordinar horarios** con ingenieros | Israel | Dolor distinto al de reportes, mismo usuario |
| Flores sufre **metrados**; Daniel sufre **planos gráficos** | Flores, Daniel | Mismo rol (arquitecto), dolores distintos según seniority |

---

## Dos capas de problema (modelo mental)

```
┌─────────────────────────────────────────────────────────┐
│  CAPA 2: GESTIÓN DE CONTEXTO (meta-problema transversal) │
│  "¿En qué etapa estoy? ¿De qué proyecto es esto?"        │
│  → 3+ proyectos paralelos, esperas del cliente, huecos    │
└─────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────┴───────────────────────────────┐
│  CAPA 1: MICRO-DOLORES MECÁNICOS (por etapa del flujo)    │
│  Fotos, normativa, FUE, metrados, CAD, coordinación...    │
│  → Cada uno: 1-5h, resoluble con Excel/IA/app puntual     │
└─────────────────────────────────────────────────────────┘
```

**Lo que escuchas en entrevistas es mayormente Capa 1.** Tu insight sobre gestión apunta a **Capa 2**, que aparece en César ("no sigo el flujo", "tengo N cosas"), Flores (informes diarios + obra), y la madre en transcripcion.txt (módulo BFS de apuntes para no perderse).

---

## Modelos de monetización posibles

### A) Suite vertical (recomendado para ICP inspección)
**Un producto, muchos micro-features empaquetados** para Inspector/Delegado/Perito:
- Captura en campo + plantilla
- RAG normativo RNE
- Generación de acta
- Estado del proyecto ("estás en etapa 4 de 6")

| Pros | Contras |
|:---|:---|
| ARPU más alto que tool puntual | Desarrollo más amplio |
| Diferencia de Report and Run | Requiere ICP estrecho |
| Vicky dijo "sería increíble" al bundle | Israel no pagaría (ya es eficiente) |

**Precio referencia:** Si ahorra 4h/semana × S/50/h = S/200/semana → suscripción S/30-80/mes es razonable **si** el bundle cubre 3+ dolores.

### B) Micro-SaaS por dolor (riesgoso)
Vender cada herramienta por separado (solo fotos, solo normativa, solo FUE).

| Pros | Contras |
|:---|:---|
| MVP más pequeño | ARPU bajo (S/5-15/mes cada uno) |
| Validación rápida | Usuario ya tiene Excel + ChatGPT gratis |
| | Churn alto al resolver un solo dolor |

### C) B2B institucional (largo plazo)
Municipalidad o CAP compra licencias para inspectores/delegados.

| Pros | Contras |
|:---|:---|
| Ticket alto | Ciclo de venta largo |
| Escala | Requiere compliance, integración |

### D) Cockpit de proyectos (Capa 2 — segunda ola)
Producto transversal para proyectistas con múltiples obras:
- "Proyecto A está en expediente, Proyecto B esperando cliente, Proyecto C en pivoteo"
- Checkpoints, no Git técnico

| Pros | Contras |
|:---|:---|
| Responde al meta-dolor real | Más difícil de vender ("¿para qué?") |
| Sticky (datos de todos los proyectos) | Proyectistas senior no sienten urgencia |

---

## Recomendación actualizada

1. **MVP:** Suite vertical para **ICP Vicky** (inspector/delegado/perito sin app, Excel/Word, 4-5h de gabinete). Incluir **indicador de etapa** del flujo como diferenciador vs. Report and Run.
2. **No perseguir** proyectistas senior como primer cliente (ya tienen IA + equipo).
3. **Validar Capa 2** con preguntas explícitas en próximas entrevistas (ver guías actualizadas).
4. **Pricing:** Bundle mensual, no por feature. Ancla: "¿cuánto vale 1 hora de tu tiempo?" × horas ahorradas.
5. **Seguir entrevistando** ITSE y estudiantes antes de expandir scope.

---

## Métricas a recolectar en próximas entrevistas

- [ ] ¿Cuántos proyectos/inspecciones activos simultáneos?
- [ ] ¿Ha perdido contexto por mezclar proyectos? ¿Ejemplo concreto?
- [ ] ¿Cuánto pagaría por [tarea X] sola vs. suite completa?
- [ ] ¿Qué herramientas paga hoy? (monto aproximado)
- [ ] ¿Quién decide la compra? (él, municipalidad, CAP, empresa)
