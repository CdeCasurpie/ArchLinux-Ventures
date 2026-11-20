"""Regenera CSV, resumen y gráficos del memo. Python 3; gráficos: Pillow.

Ejecutar desde cualquier directorio: python3 ruta/a/modelo_financiero.py
Las hipótesis se editan en supuestos_financieros.json. No consulta datos reales.
"""
import csv
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent
S = json.loads((ROOT / "supuestos_financieros.json").read_text())


def proyectar(nombre, escenario):
    clientes, caja = S["clientes_iniciales"], S["capital_inicial"]
    filas = []
    for mes in range(1, S["meses"] + 1):
        ano = (mes - 1) // 12
        iniciales = clientes
        bajas = iniciales * escenario["churn_mensual"]
        altas = escenario["altas_mensuales_por_ano"][ano]
        clientes = iniciales - bajas + altas
        # Altas y bajas ocurren al inicio del mes: cobran el mes completo.
        cobros = clientes * S["precio_final_mensual"]
        venta = cobros / (1 + S["igv"])
        reserva_igv = cobros - venta
        comisiones = cobros * S["comision_cobro_sobre_precio_final"]
        servicio = clientes * S["costo_servicio_cliente_mes"]
        adquisicion = altas * escenario["cac_caja"]
        fijo = S["costos_fijos_mensuales_por_ano"][ano]
        retiros = S["retiros_totales_fundadores_mes_por_ano"][ano]
        flujo = cobros - reserva_igv - comisiones - servicio - adquisicion - fijo - retiros
        caja += flujo
        filas.append(dict(escenario=nombre, mes=mes, ano=ano + 1,
                          clientes_iniciales=iniciales, altas=altas, bajas=bajas,
                          clientes_cierre=clientes, cobros=cobros,
                          reserva_igv=reserva_igv, ingresos_netos=venta,
                          comisiones=comisiones, servicio=servicio,
                          adquisicion=adquisicion, fijos=fijo, retiros=retiros,
                          flujo_neto=flujo, caja=caja,
                          trabajo_no_pagado=S["trabajo_no_pagado_fundadores_mes_ano_1"] if ano == 0 else 0))
    return filas


def guardar_csv(path, filas):
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=filas[0].keys())
        w.writeheader()
        w.writerows({k: round(v, 4) if isinstance(v, float) else v for k, v in r.items()} for r in filas)


def grafico(path, titulo, series, nota):
    from PIL import Image, ImageDraw, ImageFont
    im = Image.new("RGB", (1400, 820), "#f8fafc")
    d = ImageDraw.Draw(im)
    def font(size):
        for file in ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/TTF/DejaVuSans.ttf"]:
            if Path(file).exists():
                return ImageFont.truetype(file, size)
        return ImageFont.load_default()
    d.text((60, 26), titulo, font=font(30), fill="#0f172a")
    d.text((60, 76), "Soles (PEN) | SIMULACIÓN: no es tracción observada", font=font(19), fill="#475569")
    values = [v for _, _, points in series for _, v in points] + [0]
    low, high = min(values), max(values)
    span = max(high - low, 1)
    low, high = low - span * .07, high + span * .07
    x0, y0, w, h = 135, 140, 1180, 510
    def xy(x, y):
        return x0 + w * x / S["meses"], y0 + h * (high - y) / (high - low)
    for i in range(6):
        value = low + (high - low) * i / 5
        _, y = xy(0, value)
        d.line((x0, y, x0 + w, y), fill="#cbd5e1", width=1)
        d.text((10, y - 10), f"{value:,.0f}", font=font(17), fill="#475569")
    d.line((*xy(0, 0), *xy(S["meses"], 0)), fill="#64748b", width=2)
    for mes in range(0, S["meses"] + 1, 6):
        x, _ = xy(mes, 0)
        d.text((x - 8, y0 + h + 12), str(mes), font=font(18), fill="#475569")
    d.text((680, 692), "Mes comercial", font=font(18), fill="#475569")
    for i, (name, color, points) in enumerate(series):
        d.line([xy(x, y) for x, y in points], fill=color, width=5)
        x = 140 + 390 * i
        d.line((x, 744, x + 30, 744), fill=color, width=5)
        d.text((x + 40, 730), name, font=font(19), fill="#0f172a")
    d.text((60, 784), nota, font=font(15), fill="#475569")
    im.save(path)


def main():
    assert S["meses"] == 36
    assert len(S["costos_fijos_mensuales_por_ano"]) == 3
    assert S["precio_final_mensual"] > 0 and S["igv"] >= 0
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
                costos_servicio_y_cobro=sum(r["servicio"] + r["comisiones"] for r in rs),
                adquisicion=sum(r["adquisicion"] for r in rs),
                fijos=sum(r["fijos"] for r in rs), retiros=sum(r["retiros"] for r in rs),
                flujo_neto=sum(r["flujo_neto"] for r in rs), caja_cierre=rs[-1]["caja"]))
    guardar_csv(ROOT / "flujo_mensual_36m.csv", [r for fs in todos.values() for r in fs])
    guardar_csv(ROOT / "resumen_anual.csv", resumen)
    text = ["# Resultados automáticos del modelo", "", "Todos son escenarios hipotéticos. Caja negativa = financiación faltante; la operación posterior está condicionada a cubrirla.", "", "| Escenario | Año | Clientes cierre* | Ingreso neto | Flujo neto | Caja cierre |", "|---|---:|---:|---:|---:|---:|"]
    for r in resumen:
        text.append(f'| {r["escenario"]} | {r["ano"]} | {r["clientes_cierre"]:.1f} | {r["ingresos_netos"]:,.0f} | {r["flujo_neto"]:,.0f} | {r["caja_cierre"]:,.0f} |')
    text += ["", "*Valores esperados del modelo de churn: pueden ser fraccionarios; no representan personas observadas.", ""]
    for n, fs in todos.items():
        falta = next((r["mes"] for r in fs if r["caja"] < 0), None)
        deficit = max(0, -min(r["caja"] for r in fs))
        positivos = [r["mes"] for r in fs if r["flujo_neto"] >= 0 and all(x["flujo_neto"] >= 0 for x in fs[r["mes"] - 1:])]
        text.append(f'- {n}: primera caja negativa = {falta}; financiación adicional mínima hasta mes 36 = S/ {deficit:,.0f}; flujo mensual no negativo desde mes {positivos[0] if positivos else "no alcanzado"} hasta el cierre del horizonte.')
    (ROOT / "resultados_modelo.md").write_text("\n".join(text) + "\n")
    colors = ["#dc2626", "#2563eb", "#059669"]
    grafico(ROOT / "caja_escenarios.png", "ArchForms | Caja disponible y necesidad de financiación", [(n, c, [(0, S["capital_inicial"])] + [(r["mes"], r["caja"]) for r in fs]) for (n, fs), c in zip(todos.items(), colors)], "Capital inicial supuesto: S/ 10 000. Después de agotar caja, la trayectoria requiere nuevos fondos.")
    base = todos["Base"]
    grafico(ROOT / "ingresos_egresos_base.png", "ArchForms | Ingresos y egresos operativos mensuales — base", [("Ingresos sin IGV", "#2563eb", [(r["mes"], r["ingresos_netos"]) for r in base]), ("Egresos operativos", "#dc2626", [(r["mes"], sum(r[k] for k in ["comisiones", "servicio", "adquisicion", "fijos", "retiros"])) for r in base])], "Retiros totales fundadores: S/ 0, S/ 2 000 y S/ 4 000 mensuales en años 1, 2 y 3, respectivamente.")
    print("\n".join(text))


if __name__ == "__main__":
    main()
