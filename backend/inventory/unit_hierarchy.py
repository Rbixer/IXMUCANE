"""Desglose fardo → paquete → unidad (stock siempre en unidades base)."""


def split_stock_hierarchy(
    total_units: int,
    units_per_package: int,
    packages_per_fardo: int,
) -> tuple[int, int, int]:
    """
    Dado el total en unidades y la jerarquía del producto, devuelve (fardos, paquetes_resto, unidades_resto).
    1 fardo = packages_per_fardo paquetes; 1 paquete = units_per_package unidades.
    """
    upp = max(1, int(units_per_package or 1))
    ppf = max(1, int(packages_per_fardo or 1))
    per_fardo = upp * ppf
    t = max(0, int(total_units))
    fardos = t // per_fardo
    rem = t % per_fardo
    paquetes = rem // upp
    unidades = rem % upp
    return fardos, paquetes, unidades


def hierarchy_label(fardos: int, paquetes: int, unidades: int) -> str:
    return f'{fardos} f · {paquetes} pq · {unidades} u'
