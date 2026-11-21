"""Estimación del público objetivo (inspectores/supervisores IMO) en todo el Perú y
toda Latinoamérica por regla de tres simple. Escribe mercado_resultados.md.

Base contada: padrones IMO CAP + CIP de Lima, Piura y Arequipa (346 identificaciones,
ver Investigacion-y-criterios.md). Proxies:
- Población (principal): INEI, Censo 2025. Lima = Lima Metropolitana (10,1 M); no se
  encontró cifra oficial de Lima Provincias, lo que sobrestima levemente la tasa.
- Municipalidades (alternativa): INEI, directorio municipal (provinciales + distritales).
- América Latina y el Caribe: población CEPAL 2024 (663 M, Observatorio Demográfico 2024).
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PRECIO_ANUAL_SIN_IGV = 60 * 12 / 1.18
FX = 3.75

IMO = {"Lima": 86 + 130, "Piura": 32 + 38, "Arequipa": 36 + 24}
POBLACION = {"Lima": 10_100_000, "Piura": 2_115_587, "Arequipa": 1_814_396}
MUNICIPIOS = {"Lima": 10 + 161, "Piura": 8 + 57, "Arequipa": 8 + 101}
PERU_POB = 34_157_732
PERU_MUNI = 196 + 1678
LATAM_POB = 663_000_000
MEXICO_POB = 131_900_000


def fila(nombre, n):
    ingreso = n * PRECIO_ANUAL_SIN_IGV
    return f"| {nombre} | {n:,.0f} | S/ {ingreso:,.0f} | USD {ingreso / FX:,.0f} |"


def main():
    base, pob, muni = sum(IMO.values()), sum(POBLACION.values()), sum(MUNICIPIOS.values())
    tasa_pob = base / pob
    peru_pob = tasa_pob * PERU_POB
    peru_muni = base / muni * PERU_MUNI
    latam = peru_pob / PERU_POB * LATAM_POB
    out = ["# Estimación de mercado por regla de tres", "",
           "| Región contada | IMO (CAP+CIP) | Población | IMO por millón |", "|---|---:|---:|---:|"]
    for k in IMO:
        out.append(f"| {k} | {IMO[k]} | {POBLACION[k]:,} | {IMO[k] / POBLACION[k] * 1e6:.1f} |")
    out.append(f"| **Total contado** | **{base}** | **{pob:,}** | **{tasa_pob * 1e6:.1f}** |")
    out += ["", f"Perú por población: {base} x {PERU_POB:,} / {pob:,} = {peru_pob:,.0f}.",
            f"Perú por municipalidades: {base} x {PERU_MUNI:,} / {muni} = {peru_muni:,.0f} (cota superior: municipios rurales tienen menos obra).",
            f"Latinoamérica por población: {peru_pob:,.0f} x {LATAM_POB:,} / {PERU_POB:,} = {latam:,.0f}.",
            f"México (referencia): {peru_pob / PERU_POB * MEXICO_POB:,.0f}.", "",
            "| Mercado | Licencias | Ingreso anual máximo sin IGV | En USD |", "|---|---:|---:|---:|",
            fila("Base contada (3 regiones)", base), fila("Perú (población)", peru_pob),
            fila("Perú (municipalidades, cota alta)", peru_muni), fila("Latinoamérica (población)", latam), ""]
    (ROOT / "mercado_resultados.md").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
