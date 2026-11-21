"""Valoración de ArchForms por tres enfoques. Lee resumen_anual.csv (generado por
modelo_financiero.py) y escribe valuacion_resultados.md. Montos en soles (PEN).

Enfoque de ingresos (principal): valor terminal al cierre del año 3 = SDE del año 3
x múltiplo de SDE de pequeños negocios de software; se suma la caja del año 3 y se
descuenta a hoy con tasas objetivo de capital de riesgo para etapa start-up.
El resultado es post-money (el modelo ya incluye el aporte de S/ 10 000).

Enfoque de costo (piso): horas reales del MVP x costo horario de un desarrollador
junior en Lima.

Enfoque de mercado tipo startup (Berkus/Scorecard): se evalúa su aplicabilidad;
no se calcula si la empresa no alcanza el umbral de Berkus.
"""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
S = json.loads((ROOT / "supuestos_financieros.json").read_text())
FX = S["tipo_cambio_pen_usd"]
INVERSION = S["capital_inicial"]

# Múltiplos de SDE (fuentes en el memo): IBBA < USD 500k, BizBuySell IT y servicios
# de software, BizBuySell software y apps.
# Con techo latinoamericano (16 471 licencias) el negocio no se satura en Perú: se usa
# la mitad alta del rango y se descarta 2,0x (negocios pequeños sin crecimiento).
MULTIPLOS = {"BizBuySell IT/software": 2.99, "BizBuySell software/apps": 3.41}
PONDERACION = {"Pesimista": 0.1, "Base": 0.7, "Expansivo": 0.2}
# Tasas objetivo de capital de riesgo, etapa start-up (Plummer; Damodaran): 50%-70%.
TASAS = [0.50, 0.60, 0.70]
# Enfoque de costo: horas del MVP declaradas por los fundadores; sueldo junior Lima
# S/ 2 000 a S/ 4 500 mensuales / 160 h (Well HR, 2026).
HORAS = (48, 65)
TARIFA = (2000 / 160, 4500 / 160)
# Umbral de Berkus: ingresos potenciales de USD 20 M al año 5.
UMBRAL_BERKUS_USD = 20_000_000


def main():
    filas = list(csv.DictReader(open(ROOT / "resumen_anual.csv")))
    ano3 = {r["escenario"]: r for r in filas if r["ano"] == "3"}
    out = ["# Valoración de ArchForms (cálculo reproducible)", "",
           f"Inversión considerada: S/ {INVERSION:,.0f}. Tipo de cambio: {FX} PEN/USD.", "",
           "## Enfoque de ingresos (post-money, hoy)", "",
           "| Escenario | SDE año 3 | Caja año 3 | Múltiplo | Tasa | Valor terminal | Post-money | Pre-money |",
           "|---|---:|---:|---:|---:|---:|---:|---:|"]
    resumen = {}
    for esc in PONDERACION:
        r = ano3[esc]
        sde = float(r["retiros"]) + float(r["flujo_neto"])
        caja = float(r["caja_cierre"])
        valores = []
        for nombre, m in MULTIPLOS.items():
            for t in TASAS:
                vt = sde * m
                post = (vt + caja) / (1 + t) ** 3
                valores.append(post)
                out.append(f"| {esc} | {sde:,.0f} | {caja:,.0f} | {m:.2f}x | {t:.0%} | {vt:,.0f} | {post:,.0f} | {post - INVERSION:,.0f} |")
        resumen[esc] = (min(valores), sorted(valores)[len(valores) // 2], max(valores))
    out += ["", "| Escenario | Post-money mínimo | Mediana | Máximo |", "|---|---:|---:|---:|"]
    for esc, (lo, me, hi) in resumen.items():
        out.append(f"| {esc} | S/ {lo:,.0f} (USD {lo / FX:,.0f}) | S/ {me:,.0f} (USD {me / FX:,.0f}) | S/ {hi:,.0f} (USD {hi / FX:,.0f}) |")
    post = sum(PONDERACION[e] * resumen[e][1] for e in PONDERACION)
    pre = post - INVERSION
    out += ["", "## Conclusión (ponderación 10% pesimista / 70% base / 20% expansivo, medianas)", "",
            f"Post-money: S/ {post:,.0f} (USD {post / FX:,.0f}). Pre-money: S/ {pre:,.0f} (USD {pre / FX:,.0f}). "
            f"S/ {INVERSION:,.0f} equivalen a {INVERSION / post:.1%} de la empresa."]
    costo = (HORAS[0] * TARIFA[0], HORAS[1] * TARIFA[1])
    out += ["", "## Enfoque de costo (piso)", "",
            f"{HORAS[0]}–{HORAS[1]} h x S/ {TARIFA[0]:.1f}–{TARIFA[1]:.1f} por hora = "
            f"S/ {costo[0]:,.0f}–{costo[1]:,.0f} (USD {costo[0] / FX:,.0f}–{costo[1] / FX:,.0f}).", ""]
    techo_pen = S["mercado_latam_licencias"] * S["precio_final_mensual"] * 12 / (1 + S["igv"])
    out += ["## Aplicabilidad de métodos tipo startup", "",
            f"Ingreso anual máximo si se captara todo Latinoamérica ({S['mercado_latam_licencias']:,} licencias): "
            f"S/ {techo_pen:,.0f} (USD {techo_pen / FX:,.0f}). Umbral de Berkus: USD {UMBRAL_BERKUS_USD:,.0f} al año 5. "
            "Berkus y Scorecard no aplican.", ""]
    (ROOT / "valuacion_resultados.md").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
