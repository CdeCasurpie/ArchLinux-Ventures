"""Regenera CSV, resumen y gráficos del memo. Python 3; gráficos: Pillow.

Ejecutar desde cualquier directorio: python3 ruta/a/modelo_financiero.py
Las hipótesis se editan en supuestos_financieros.json. No consulta datos reales.

Lógica v2:
- Infraestructura = Supabase según uso (plan Pro desde el umbral de clientes,
  sobrecosto de almacenamiento). Sin costo fijo de servicio por cliente.
- CAC derivado del presupuesto de captación / altas que ese presupuesto produce
  en el primer año del escenario.
- Retiros de fundadores: 0 en el año 1 (trabajo no pagado); desde el año 2 se
  retira el excedente operativo (cobros − IGV − comisiones − infraestructura −
  adquisición − otros fijos), con tope de retiro objetivo.
"""
import csv
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent
S = json.loads((ROOT / "supuestos_financieros.json").read_text())
SB = S["supabase"]
FX = S["tipo_cambio_pen_usd"]


def costos_operativos(mes, clientes):
    """Dominio, hosting, Apple, Google Play y API de traducción (PEN por mes)."""
    C = S["costos_operativos"]
    total = 0.0
    if mes >= C["dominio_inicio_mes"] and (mes - C["dominio_inicio_mes"]) % 12 == 0:
        total += C["dominio_pen_anual"]
    if mes >= C["hosting_inicio_mes"]:
        total += C["hosting_usd_mes"] * FX
    if mes >= C["ios_inicio_mes"] and (mes - C["ios_inicio_mes"]) % 12 == 0:
        total += C["apple_usd_anual"] * FX
    if mes == C["google_play_mes"]:
        total += C["google_play_usd_unico"] * FX
    if mes >= C["traduccion_inicio_mes"]:
        facturable = max(0.0, clientes * C["caracteres_por_cliente_mes"] - C["traduccion_gratis_chars_mes"])
        total += facturable / 1_000_000 * C["traduccion_usd_por_millon"] * FX
    return total


def proyectar(nombre, esc):
    clientes, caja = S["clientes_iniciales"], S["capital_inicial"]
    filas = []
    cac = S["presupuesto_captacion"] / (esc["altas_mensuales_por_ano"][0] * 12)
    for mes in range(1, S["meses"] + 1):
        ano = (mes - 1) // 12
        gratis = S.get("meses_gratis", 0)
        if gratis and mes == gratis + 1:
            # Fin del periodo gratuito: solo una fracción de los usuarios pasa a pagar.
            clientes *= esc.get("conversion_al_cobro", 1.0)
        inicial = clientes
        bajas = inicial * esc["churn_mensual"]
        altas = esc["altas_mensuales_por_ano"][ano]
        clientes = inicial - bajas + altas
        cobros = clientes * S["precio_final_mensual"] if mes > gratis else 0.0
        venta = cobros / (1 + S["igv"])
        reserva_igv = cobros - venta
        comisiones = cobros * S["comision_cobro_sobre_precio_final"]
        # Infraestructura: almacenamiento acumulado por cliente activo, con retención limitada.
        gb = clientes * SB["gb_por_cliente_mes"] * min(mes, SB["meses_retencion_media"])
        if clientes >= SB["umbral_clientes_pro"]:
            sobre = max(0.0, gb - SB["almacenamiento_incluido_gb"]) * SB["precio_almacenamiento_usd_gb"]
            supabase_pen = (SB["plan_pro_usd_mes"] + sobre) * FX
        else:
            supabase_pen = 0.0
        adquisicion = altas * cac
        fijo = S["otros_fijos_mensuales_por_ano"][ano]
        otros = costos_operativos(mes, clientes)
        operativo = cobros - reserva_igv - comisiones - supabase_pen - adquisicion - fijo - otros
        retiro_objetivo = S["retiro_objetivo_mensual_por_ano"][ano]
        sin_retiro = mes <= S.get("meses_sin_retiro_fundadores", 12)
        retiro = 0.0 if sin_retiro else min(retiro_objetivo, max(0.0, operativo))
        flujo = operativo - retiro
        caja += flujo
        filas.append(dict(escenario=nombre, mes=mes, ano=ano + 1,
                          clientes_iniciales=inicial, altas=altas, bajas=bajas,
                          clientes_cierre=clientes, almacenamiento_gb=gb,
                          cobros=cobros, reserva_igv=reserva_igv, ingresos_netos=venta,
                          comisiones=comisiones, infraestructura=supabase_pen,
                          adquisicion=adquisicion, cac=cac, fijos=fijo, otros_operativos=otros, operativo=operativo,
                          retiros=retiro, flujo_neto=flujo, caja=caja,
                          trabajo_no_pagado=S["trabajo_no_pagado_fundadores_mes_ano_1"] if sin_retiro else 0))
    return filas


def guardar_csv(path, filas):
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=filas[0].keys())
        w.writeheader()
        w.writerows({k: round(v, 4) if isinstance(v, float) else v for k, v in r.items()} for r in filas)


def grafico(path, titulo, series, nota):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.ticker import FuncFormatter, MultipleLocator

    def soles(v, _=None):
        return "S/ " + f"{v:,.0f}".replace(",", " ")

    fig, ax = plt.subplots(figsize=(7.2, 4.6), dpi=250)
    fig.patch.set_facecolor("white")
    for nombre, color, pts in series:
        ax.plot([x for x, _ in pts], [y for _, y in pts], color=color, linewidth=2.6, label=nombre)
    for mes in (12, 24, 36):
        puntos = [(dict(pts).get(mes), color) for _, color, pts in series if dict(pts).get(mes) is not None]
        puntos.sort(key=lambda v: -v[0])
        for rango, (y, color) in enumerate(puntos):
            if rango == 0:
                offset, ha = (0, 10), "center"
            elif rango == len(puntos) - 1:
                offset, ha = (0, -18), "center"
            else:
                offset, ha = ((10, -4), "left") if mes < S["meses"] else ((-10, 6), "right")
            ax.scatter([mes], [y], color=color, s=28, zorder=3)
            ax.annotate(soles(y), (mes, y), textcoords="offset points", xytext=offset,
                        ha=ha, fontsize=9, color=color, fontweight="bold")
    ax.axhline(0, color="#475569", linewidth=1)
    ax.set_xlim(0, S["meses"] + 1)
    ax.xaxis.set_major_locator(MultipleLocator(6))
    ax.yaxis.set_major_formatter(FuncFormatter(soles))
    ax.set_xlabel("Mes comercial", fontsize=11)
    ax.set_ylabel("Soles (PEN)", fontsize=11)
    ax.tick_params(labelsize=10)
    ax.grid(axis="y", color="#e2e8f0")
    for lado in ("top", "right"):
        ax.spines[lado].set_visible(False)
    ax.margins(y=0.12)
    ax.set_title(titulo, fontsize=14, fontweight="bold", loc="left", pad=22)
    ax.text(0, 1.02, "Simulación: no es tracción observada", transform=ax.transAxes,
            fontsize=10, color="#475569")
    ax.legend(loc="upper left", fontsize=10, frameon=False)
    fig.text(0.01, 0.01, nota, fontsize=9, color="#475569")
    fig.tight_layout(rect=(0, 0.04, 1, 1))
    fig.savefig(path)
    plt.close(fig)


def main():
    assert S["meses"] == 36
    todos = {n: proyectar(n, e) for n, e in S["escenarios"].items()}
    resumen = []
    for n, filas in todos.items():
        for r in filas:
            assert r["clientes_cierre"] >= 0
            assert math.isclose(r["cobros"], r["ingresos_netos"] + r["reserva_igv"])
        for ano in range(1, 4):
            rs = [r for r in filas if r["ano"] == ano]
            resumen.append(dict(escenario=n, ano=ano,
                clientes_cierre=rs[-1]["clientes_cierre"],
                ingresos_netos=sum(r["ingresos_netos"] for r in rs),
                infraestructura=sum(r["infraestructura"] for r in rs),
                comisiones=sum(r["comisiones"] for r in rs),
                adquisicion=sum(r["adquisicion"] for r in rs),
                fijos=sum(r["fijos"] for r in rs), retiros=sum(r["retiros"] for r in rs),
                flujo_neto=sum(r["flujo_neto"] for r in rs), caja_cierre=rs[-1]["caja"]))
    guardar_csv(ROOT / "flujo_mensual_36m.csv", [r for fs in todos.values() for r in fs])
    guardar_csv(ROOT / "resumen_anual.csv", resumen)
    text = ["# Resultados automáticos del modelo (v2)", "",
            "Todos son escenarios hipotéticos. Caja negativa = financiación faltante.", "",
            "| Escenario | Año | Clientes cierre* | Ingreso neto | Flujo neto | Caja cierre |",
            "|---|---:|---:|---:|---:|---:|"]
    for r in resumen:
        text.append(f'| {r["escenario"]} | {r["ano"]} | {r["clientes_cierre"]:.1f} | {r["ingresos_netos"]:,.0f} | {r["flujo_neto"]:,.0f} | {r["caja_cierre"]:,.0f} |')
    text += ["", "*Valores esperados del modelo de churn: pueden ser fraccionarios.", ""]
    for n, fs in todos.items():
        falta = next((r["mes"] for r in fs if r["caja"] < 0), None)
        deficit = max(0, -min(r["caja"] for r in fs))
        text.append(f"- {n}: CAC derivado = S/ {fs[0]['cac']:,.0f}; primera caja negativa = mes {falta}; "
                    f"financiación adicional mínima = S/ {deficit:,.0f}; "
                    f"primer pico de clientes con Supabase Pro = mes {next((r['mes'] for r in fs if r['infraestructura'] > 0), 'n/a')}.")
    (ROOT / "resultados_modelo.md").write_text("\n".join(text) + "\n")
    colors = ["#dc2626", "#2563eb", "#059669"]
    grafico(ROOT / "caja_escenarios.png", "ArchForms: caja disponible por escenario",
            [(n, c, [(0, S["capital_inicial"])] + [(r["mes"], r["caja"]) for r in fs])
             for (n, fs), c in zip(todos.items(), colors)],
            "Supuestos: aporte de S/ 10 000; Supabase fijo; sin retiros durante 18 meses.")
    base = todos["Base"]
    grafico(ROOT / "ingresos_egresos_base.png", "ArchForms: ingresos y egresos mensuales (escenario base)",
            [("Ingresos sin IGV", "#2563eb", [(r["mes"], r["ingresos_netos"]) for r in base]),
             ("Egresos operativos (incl. retiros)", "#dc2626",
              [(r["mes"], r["ingresos_netos"] - r["operativo"] + r["retiros"] + r["reserva_igv"] * 0) for r in base])],
            "Egresos = ingreso sin IGV − resultado operativo + retiros. Simulación.")
    print("\n".join(text))


if __name__ == "__main__":
    main()
