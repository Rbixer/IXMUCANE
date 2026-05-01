"""Identificadores de módulos del panel (coinciden con el front)."""

PANEL_MODULE_IDS: frozenset[str] = frozenset(
    {
        'dashboard',
        'proveedores',
        'inventario',
        'inventario_bodega_1',
        'inventario_bodega_2',
        'inventario_bodega_3',
        'estadisticas',
        'reportes',
        'pos',
    }
)

# Tras crear usuario panel: solo inicio hasta que el administrador asigne más módulos.
PANEL_MODULES_ON_USER_CREATE: list[str] = ['dashboard']

# Usuarios panel ya existentes antes del control por módulos (migración de datos).
PANEL_MODULES_LEGACY_DEFAULT: list[str] = ['dashboard', 'inventario', 'estadisticas']


def normalize_panel_modules(raw: list | None) -> list[str]:
    """Lista ordenada y sin duplicados; siempre incluye dashboard si hay algún módulo válido."""
    if not raw:
        return ['dashboard']
    seen: set[str] = set()
    out: list[str] = []
    for x in raw:
        if not isinstance(x, str):
            continue
        k = x.strip()
        # Compatibilidad: permiso legado que agrupaba las 3 bodegas.
        if k == 'inventario_bodegas':
            for legacy in ('inventario_bodega_1', 'inventario_bodega_2', 'inventario_bodega_3'):
                if legacy not in seen:
                    seen.add(legacy)
                    out.append(legacy)
            continue
        if k not in PANEL_MODULE_IDS or k in seen:
            continue
        seen.add(k)
        out.append(k)
    if 'dashboard' not in seen:
        out.insert(0, 'dashboard')
    return out
