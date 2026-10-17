/** Optional build-time hint. Empty means the server's first RNV_ADDONS_ROOTS entry. */
export const DEFAULT_ADDONS_ROOT = (process.env.NEXT_PUBLIC_ADDONS_DEFAULT_ROOT || "").trim();
export const ADDONS_ROOT_STORAGE_KEY = "rnv.addons.root";

export const DESKTOP_ONLY_MESSAGE =
    "Addons está disponible solo en escritorio. La carpeta de módulos vive en tu Mac y esta sesión no puede leerla.";

export const GITIGNORE_LINES = [
    "*RNC_Contribuyentes*.csv",
    "__pycache__/",
    "*.pyc",
] as const;

export const COMMON_AREAS = [
    "fiscal_rd",
    "pos",
    "inventario",
    "ventas",
    "contabilidad",
    "rrhh",
    "branding_ui",
    "integraciones",
    "reportes",
    "utilidades",
] as const;

export type GitBadge = "subido" | "no_subido" | "cambios_pendientes";

export type GitInfo = {
    inRepo: boolean;
    repoRoot: string | null;
    hasRemote: boolean;
    remoteUrl: string | null;
    hasUpstream: boolean;
    dirty: boolean;
    ahead: number;
    behind: number;
    lastCommit: { hash: string; date: string; message: string } | null;
    badge: GitBadge;
    badgeLabel: string;
};

export type ManifestInfo = {
    name: string;
    version: string;
    summary: string;
    description: string;
    author: string;
    depends: string[];
    data: string[];
    license: string;
    odooVersion: string;
};

export type MapaRow = {
    module: string;
    areaOrClient: string;
    tipoNegocio: string;
    versions: string;
    clientsUsing: string;
    ubicaciones: string;
    estado: string;
    reemplazadoPor: string;
    clientesAMigrar: string;
    familia: string;
    instaladoEnClientes: string;
};

export type ModuleVersion = {
    version: string;
    relativePath: string;
    manifest: ManifestInfo | null;
};

export type ModuleSummary = {
    name: string;
    relativePath: string;
    category: "comunes" | "clientes" | "revisar" | "archivados" | "otro";
    area: string;
    tipoNegocio: string;
    cliente: string;
    versions: string[];
    estado: string;
    manifestName: string;
    summary: string;
    mapa: MapaRow | null;
    git: GitInfo;
};

export type TreeNode = {
    name: string;
    relativePath: string;
    kind: "folder" | "module" | "version";
    moduleRoot: string | null;
    git: GitInfo;
    children: TreeNode[];
};

export type StatBucket = { key: string; count: number };

export type AddonsStats = {
    totalModules: number;
    byArea: StatBucket[];
    byTipo: StatBucket[];
    byVersion: StatBucket[];
    gitSubido: number;
    gitNoSubido: number;
    gitCambios: number;
};

export type ScanResponse = {
    available: boolean;
    message?: string;
    root?: string;
    tree?: TreeNode;
    modules?: ModuleSummary[];
    stats?: AddonsStats;
    areas?: string[];
    tipos?: string[];
    clientes?: string[];
    warnings?: string[];
    defaultRoot?: string;
};

export type ModuleDetail = {
    module: ModuleSummary;
    manifests: ModuleVersion[];
    fileCount: number;
    totalBytes: number;
    readme: { name: string; text: string } | null;
    motivo: { name: string; text: string } | null;
    git: GitInfo;
};

export type DetailResponse = {
    available: boolean;
    message?: string;
    detail?: ModuleDetail;
};

export type ActionResponse = {
    available: boolean;
    ok: boolean;
    message: string;
};
