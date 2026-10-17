//! Addons Odoo: lectura local de la carpeta raíz, git y mapa.csv.
//! Los comandos corren en la Mac del usuario. El push usa el git del sistema
//! y la clave SSH; no se guardan tokens.

use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

const GITIGNORE_LINES: [&str; 3] = ["*RNC_Contribuyentes*.csv", "__pycache__/", "*.pyc"];
const HEADER: [&str; 11] = [
    "module",
    "area_or_client",
    "tipo_negocio",
    "versions",
    "clients_using",
    "ubicaciones_encontradas",
    "estado",
    "reemplazado_por",
    "clientes_a_migrar",
    "familia_duplicados",
    "instalado_en_clientes",
];

struct MapaRow {
    module: String,
    area_or_client: String,
    tipo_negocio: String,
    versions: String,
    clients_using: String,
    ubicaciones: String,
    estado: String,
    reemplazado_por: String,
    clientes_a_migrar: String,
    familia: String,
    instalado_en_clientes: String,
}

struct RepoSnap {
    remote: Option<String>,
    has_upstream: bool,
    ahead: i64,
    behind: i64,
    dirty: Vec<String>,
    head: Option<(String, String, String)>,
}

struct Ctx {
    mapa: Vec<MapaRow>,
    modules: Vec<Value>,
    repo_of: HashMap<PathBuf, Option<PathBuf>>,
    snaps: HashMap<PathBuf, RepoSnap>,
}

fn run(cmd: &str, args: &[&str], cwd: &Path) -> Result<(i32, String, String), String> {
    let output = Command::new(cmd)
        .args(args)
        .current_dir(cwd)
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()
        .map_err(|err| format!("No se pudo ejecutar {cmd}: {err}"))?;
    Ok((
        output.status.code().unwrap_or(1),
        String::from_utf8_lossy(&output.stdout).to_string(),
        String::from_utf8_lossy(&output.stderr).to_string(),
    ))
}

fn python_stdin(script: &str, input: &str) -> Result<String, String> {
    let mut child = Command::new("python3")
        .arg("-c")
        .arg(script)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|err| err.to_string())?;
    child
        .stdin
        .as_mut()
        .ok_or("stdin")?
        .write_all(input.as_bytes())
        .map_err(|err| err.to_string())?;
    let output = child.wait_with_output().map_err(|err| err.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

pub fn is_github_remote(url: &str) -> bool {
    let trimmed = url.trim();
    if trimmed.is_empty() || trimmed.chars().any(|ch| ch.is_whitespace()) {
        return false;
    }
    let lower = trimmed.to_ascii_lowercase();
    if lower.contains("ghp_") || lower.contains("github_pat_") || trimmed.contains("://") && trimmed.split("://").nth(1).unwrap_or("").split('@').next().unwrap_or("").contains(':') {
        return false;
    }
    let ssh = trimmed.starts_with("git@github.com:") && trimmed.matches('/').count() == 1;
    let ssh_url = trimmed.starts_with("ssh://git@github.com/") && trimmed.matches('/').count() >= 3;
    let https = trimmed.starts_with("https://github.com/") && !trimmed[19..].contains('@');
    let body_ok = |value: &str| {
        value.split(['/', ':']).filter(|part| part.contains('/') || part.contains(':') || !part.is_empty()).all(|part| {
            part.trim_start_matches("git@github.com").trim_start_matches("ssh://git@github.com").trim_start_matches("https://github.com").chars().all(|ch| ch.is_ascii_alphanumeric() || "/._-".contains(ch))
        })
    };
    (ssh || ssh_url || https) && body_ok(trimmed) && !trimmed.contains("..")
}

pub fn decide_badge(in_repo: bool, has_remote: bool, has_upstream: bool, dirty: bool, ahead: i64) -> (&'static str, &'static str) {
    if !in_repo {
        return ("no_subido", "No subido");
    }
    if dirty || ahead > 0 {
        return ("cambios_pendientes", "Cambios pendientes");
    }
    if !has_remote || !has_upstream {
        return ("no_subido", "No subido");
    }
    ("subido", "Subido a Git")
}

fn is_version_name(name: &str) -> bool {
    let mut parts = name.split('.');
    match (parts.next(), parts.next(), parts.next()) {
        (Some(major), Some(minor), None) => {
            !major.is_empty()
                && !minor.is_empty()
                && major.chars().all(|ch| ch.is_ascii_digit())
                && minor.chars().all(|ch| ch.is_ascii_digit())
        }
        _ => false,
    }
}

fn rel_posix(root: &Path, abs: &Path) -> String {
    abs.strip_prefix(root)
        .unwrap_or(abs)
        .components()
        .map(|component| component.as_os_str().to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join("/")
}

fn list_dirs(dir: &Path) -> Vec<PathBuf> {
    let mut found = Vec::new();
    let Ok(entries) = fs::read_dir(dir) else { return found };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || name == "__pycache__" || name == "node_modules" {
            continue;
        }
        if entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false) {
            found.push(entry.path());
        }
    }
    found.sort();
    found
}

fn has_manifest(dir: &Path) -> bool {
    dir.join("__manifest__.py").is_file()
}

fn is_version_dir(dir: &Path) -> bool {
    dir.file_name().and_then(|name| name.to_str()).map(is_version_name).unwrap_or(false) && has_manifest(dir)
}

fn is_module_dir(dir: &Path) -> bool {
    let name = dir.file_name().and_then(|value| value.to_str()).unwrap_or("");
    if has_manifest(dir) && !is_version_name(name) {
        return true;
    }
    list_dirs(dir).into_iter().any(|child| is_version_dir(&child))
}

struct Classified {
    category: &'static str,
    area: String,
    tipo: String,
    cliente: String,
    module_name: String,
}

fn classify(relative: &str) -> Classified {
    let mut parts: Vec<&str> = relative.split('/').filter(|part| !part.is_empty()).collect();
    if parts.last().copied().map(is_version_name).unwrap_or(false) {
        parts.pop();
    }
    let module_name = parts.last().copied().unwrap_or("").to_string();
    let top = parts.first().copied().unwrap_or("");
    if top == "comunes" {
        return Classified { category: "comunes", area: parts.get(1).copied().unwrap_or("").to_string(), tipo: String::new(), cliente: String::new(), module_name };
    }
    if top == "clientes" {
        return Classified {
            category: "clientes",
            area: String::new(),
            tipo: parts.get(1).copied().unwrap_or("").to_string(),
            cliente: parts.get(2).copied().unwrap_or("").to_string(),
            module_name,
        };
    }
    if top == "_revisar" {
        return Classified { category: "revisar", area: String::new(), tipo: String::new(), cliente: String::new(), module_name };
    }
    if top == "_archivados" {
        return Classified { category: "archivados", area: String::new(), tipo: String::new(), cliente: String::new(), module_name };
    }
    Classified { category: "otro", area: String::new(), tipo: String::new(), cliente: String::new(), module_name }
}

fn area_or_client(relative: &str) -> String {
    let info = classify(relative);
    match info.category {
        "comunes" => format!("comunes/{}", info.area),
        "clientes" => format!("clientes/{}/{}", info.tipo, info.cliente),
        "revisar" => "_revisar".to_string(),
        "archivados" => format!("_archivados/{}", info.module_name),
        _ => relative.trim_end_matches('/').to_string(),
    }
}

fn parse_csv(text: &str) -> Vec<Vec<String>> {
    let mut rows = Vec::new();
    let mut row = Vec::new();
    let mut cell = String::new();
    let mut quoted = false;
    let chars: Vec<char> = text.chars().collect();
    let mut index = 0;
    while index < chars.len() {
        let ch = chars[index];
        if quoted {
            if ch == '"' {
                if chars.get(index + 1) == Some(&'"') {
                    cell.push('"');
                    index += 2;
                    continue;
                }
                quoted = false;
            } else {
                cell.push(ch);
            }
            index += 1;
            continue;
        }
        if ch == '"' {
            quoted = true;
            index += 1;
            continue;
        }
        if ch == ',' {
            row.push(std::mem::take(&mut cell));
            index += 1;
            continue;
        }
        if ch == '\n' {
            row.push(std::mem::take(&mut cell));
            rows.push(std::mem::take(&mut row));
            index += 1;
            continue;
        }
        if ch == '\r' {
            index += 1;
            continue;
        }
        cell.push(ch);
        index += 1;
    }
    if !cell.is_empty() || !row.is_empty() {
        row.push(cell);
        rows.push(row);
    }
    rows.into_iter().filter(|item| item.iter().any(|value| !value.trim().is_empty())).collect()
}

fn csv_escape(value: &str) -> String {
    if value.contains([',', '"', '\n', '\r']) {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}

fn load_mapa(root: &Path) -> (Vec<MapaRow>, Vec<String>) {
    let file = root.join("mapa.csv");
    if !file.is_file() {
        return (Vec::new(), vec!["No se encontró mapa.csv en la raíz".to_string()]);
    }
    let text = fs::read_to_string(&file).unwrap_or_default();
    let table = parse_csv(&text);
    if table.is_empty() {
        return (Vec::new(), vec!["mapa.csv está vacío".to_string()]);
    }
    let header = &table[0];
    let index = |key: &str| header.iter().position(|cell| cell.trim() == key);
    let cell = |row: &Vec<String>, key: &str| index(key).and_then(|at| row.get(at)).map(|value| value.trim().to_string()).unwrap_or_default();
    let rows = table
        .iter()
        .skip(1)
        .map(|row| MapaRow {
            module: cell(row, "module"),
            area_or_client: cell(row, "area_or_client"),
            tipo_negocio: cell(row, "tipo_negocio"),
            versions: cell(row, "versions"),
            clients_using: cell(row, "clients_using"),
            ubicaciones: cell(row, "ubicaciones_encontradas"),
            estado: cell(row, "estado"),
            reemplazado_por: cell(row, "reemplazado_por"),
            clientes_a_migrar: cell(row, "clientes_a_migrar"),
            familia: cell(row, "familia_duplicados"),
            instalado_en_clientes: cell(row, "instalado_en_clientes"),
        })
        .filter(|row| !row.module.is_empty())
        .collect();
    (rows, Vec::new())
}

fn write_mapa(root: &Path, rows: &[MapaRow]) -> Result<(), String> {
    let mut lines = vec![HEADER.join(",")];
    for row in rows {
        let cells = [
            row.module.as_str(),
            row.area_or_client.as_str(),
            row.tipo_negocio.as_str(),
            row.versions.as_str(),
            row.clients_using.as_str(),
            row.ubicaciones.as_str(),
            row.estado.as_str(),
            row.reemplazado_por.as_str(),
            row.clientes_a_migrar.as_str(),
            row.familia.as_str(),
            row.instalado_en_clientes.as_str(),
        ];
        lines.push(cells.iter().copied().map(csv_escape).collect::<Vec<_>>().join(","));
    }
    fs::write(root.join("mapa.csv"), format!("{}\n", lines.join("\n"))).map_err(|err| err.to_string())
}

fn mapa_json(row: &MapaRow) -> Value {
    json!({
        "module": row.module,
        "areaOrClient": row.area_or_client,
        "tipoNegocio": row.tipo_negocio,
        "versions": row.versions,
        "clientsUsing": row.clients_using,
        "ubicaciones": row.ubicaciones,
        "estado": row.estado,
        "reemplazadoPor": row.reemplazado_por,
        "clientesAMigrar": row.clientes_a_migrar,
        "familia": row.familia,
        "instaladoEnClientes": row.instalado_en_clientes,
    })
}

fn pick_mapa<'a>(rows: &'a [MapaRow], module_name: &str, module_root: &str) -> Option<&'a MapaRow> {
    let key = area_or_client(module_root);
    let mut matches = rows.iter().filter(|row| row.module == module_name && (row.area_or_client == key || row.area_or_client == format!("{key}/{module_name}")));
    matches.find(|row| row.estado == "keeper").or_else(|| {
        rows.iter().find(|row| row.module == module_name && (row.area_or_client == key || row.area_or_client == format!("{key}/{module_name}")))
    })
}

fn parse_manifest(file: &Path, folder_version: Option<&str>) -> Option<Value> {
    let source = fs::read_to_string(file).ok()?;
    let script = r#"
import ast, json, sys
src = sys.stdin.read()
tree = ast.parse(src)
found = None
for node in tree.body:
    if isinstance(node, ast.Expr) and isinstance(node.value, ast.Dict):
        found = node.value
        break
    if isinstance(node, ast.Assign) and isinstance(node.value, ast.Dict):
        found = node.value
        break
def lit(node):
    if isinstance(node, ast.Constant):
        return node.value if isinstance(node.value, (str, int, float, bool)) or node.value is None else str(node.value)
    if isinstance(node, (ast.List, ast.Tuple)):
        return [lit(x) for x in node.elts]
    if isinstance(node, ast.Dict):
        out = {}
        for k, v in zip(node.keys, node.values):
            key = lit(k)
            if isinstance(key, str):
                out[key] = lit(v)
        return out
    return None
data = lit(found) if found is not None else None
keys = ['name','version','summary','description','author','license','depends','data']
json.dump({k: data.get(k) for k in keys if isinstance(data, dict) and k in data} if isinstance(data, dict) else {}, sys.stdout, ensure_ascii=False)
"#;
    let parsed = python_stdin(script, &source).ok()?;
    let mut data: Value = serde_json::from_str(parsed.trim()).ok()?;
    let version = data.get("version").and_then(|value| value.as_str()).unwrap_or("").to_string();
    let odoo = folder_version
        .filter(|value| is_version_name(value))
        .map(|value| value.to_string())
        .or_else(|| {
            let mut parts = version.split('.');
            match (parts.next(), parts.next()) {
                (Some(major), Some(minor)) if !major.is_empty() && !minor.is_empty() => Some(format!("{major}.{minor}")),
                _ => None,
            }
        })
        .unwrap_or_default();
    if let Some(object) = data.as_object_mut() {
        object.insert("odooVersion".to_string(), json!(odoo));
        for key in ["summary", "description", "author", "license", "name", "version"] {
            if !object.contains_key(key) {
                object.insert(key.to_string(), json!(""));
            }
        }
        for key in ["depends", "data"] {
            if !object.contains_key(key) {
                object.insert(key.to_string(), json!([]));
            }
        }
    }
    Some(data)
}

fn empty_git() -> Value {
    json!({
        "inRepo": false,
        "repoRoot": null,
        "hasRemote": false,
        "remoteUrl": null,
        "hasUpstream": false,
        "dirty": false,
        "ahead": 0,
        "behind": 0,
        "lastCommit": null,
        "badge": "no_subido",
        "badgeLabel": "No subido"
    })
}

fn parse_dirty(stdout: &str) -> Vec<String> {
    let parts: Vec<&str> = stdout.split('\0').filter(|part| !part.is_empty()).collect();
    let mut paths = Vec::new();
    let mut index = 0;
    while index < parts.len() {
        let entry = parts[index];
        if entry.len() >= 4 {
            let code = &entry[..2];
            let first = entry[3..].replace('\\', "/");
            if !first.is_empty() {
                paths.push(first);
            }
            if code.contains('R') || code.contains('C') {
                if let Some(second) = parts.get(index + 1) {
                    paths.push(second.replace('\\', "/"));
                    index += 1;
                }
            }
        }
        index += 1;
    }
    paths
}

fn repo_snapshot(repo: &Path, snaps: &mut HashMap<PathBuf, RepoSnap>) -> RepoSnap {
    if let Some(cached) = snaps.get(repo) {
        return RepoSnap {
            remote: cached.remote.clone(),
            has_upstream: cached.has_upstream,
            ahead: cached.ahead,
            behind: cached.behind,
            dirty: cached.dirty.clone(),
            head: cached.head.clone(),
        };
    }
    let remote = run("git", &["remote", "get-url", "origin"], repo).ok().filter(|(code, _, _)| *code == 0).map(|(_, stdout, _)| stdout.trim().to_string()).filter(|value| !value.is_empty());
    let upstream = run("git", &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], repo).ok();
    let has_upstream = upstream.as_ref().map(|(code, stdout, _)| *code == 0 && !stdout.trim().is_empty()).unwrap_or(false);
    let (ahead, behind) = if has_upstream {
        run("git", &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"], repo)
            .ok()
            .filter(|(code, _, _)| *code == 0)
            .map(|(_, stdout, _)| {
                let mut parts = stdout.split_whitespace();
                (parts.next().and_then(|value| value.parse().ok()).unwrap_or(0), parts.next().and_then(|value| value.parse().ok()).unwrap_or(0))
            })
            .unwrap_or((0, 0))
    } else {
        (0, 0)
    };
    let dirty = run("git", &["status", "--porcelain", "-z", "-uall"], repo).ok().filter(|(code, _, _)| *code == 0).map(|(_, stdout, _)| parse_dirty(&stdout)).unwrap_or_default();
    let head = run("git", &["log", "-1", "--format=%H%x1f%cI%x1f%s"], repo).ok().filter(|(code, stdout, _)| *code == 0 && !stdout.trim().is_empty()).and_then(|(_, stdout, _)| {
        let mut parts = stdout.trim().split('\u{1f}');
        Some((parts.next()?.to_string(), parts.next().unwrap_or("").to_string(), parts.next().unwrap_or("").to_string()))
    });
    let snap = RepoSnap { remote, has_upstream, ahead, behind, dirty, head };
    snaps.insert(repo.to_path_buf(), RepoSnap { remote: snap.remote.clone(), has_upstream, ahead, behind, dirty: snap.dirty.clone(), head: snap.head.clone() });
    snap
}

fn find_repo(dir: &Path, root: &Path, cache: &mut HashMap<PathBuf, Option<PathBuf>>) -> Option<PathBuf> {
    if let Some(cached) = cache.get(dir) {
        return cached.clone();
    }
    if dir.join(".git").exists() {
        let top = run("git", &["rev-parse", "--show-toplevel"], dir).ok().filter(|(code, _, _)| *code == 0).map(|(_, stdout, _)| PathBuf::from(stdout.trim())).filter(|path| path.is_dir());
        let repo = top.unwrap_or_else(|| dir.to_path_buf());
        cache.insert(dir.to_path_buf(), Some(repo.clone()));
        return Some(repo);
    }
    if dir == root {
        cache.insert(dir.to_path_buf(), None);
        return None;
    }
    let parent = dir.parent()?;
    if parent == dir {
        cache.insert(dir.to_path_buf(), None);
        return None;
    }
    let found = find_repo(parent, root, cache);
    cache.insert(dir.to_path_buf(), found.clone());
    found
}

fn path_dirty(repo: &Path, abs: &Path, dirty: &[String]) -> bool {
    let rel = rel_posix(repo, abs);
    if rel.is_empty() || rel == "." {
        return !dirty.is_empty();
    }
    dirty.iter().any(|item| item == &rel || item.starts_with(&format!("{rel}/")))
}

fn last_commit(repo: &Path, abs: &Path, head: &Option<(String, String, String)>) -> Option<(String, String, String)> {
    let rel = rel_posix(repo, abs);
    let at_root = rel.is_empty() || rel == ".";
    let mut args = vec!["log".to_string(), "-1".to_string(), "--format=%H%x1f%cI%x1f%s".to_string()];
    if !at_root {
        args.push("--".to_string());
        args.push(rel);
    }
    let arg_refs: Vec<&str> = args.iter().map(|value| value.as_str()).collect();
    if let Ok((0, stdout, _)) = run("git", &arg_refs, repo) {
        if !stdout.trim().is_empty() {
            let mut parts = stdout.trim_end_matches('\n').split('\u{1f}');
            if let Some(hash) = parts.next() {
                return Some((hash.to_string(), parts.next().unwrap_or("").to_string(), parts.next().unwrap_or("").to_string()));
            }
        }
    }
    if at_root { head.clone() } else { None }
}

fn git_info(abs: &Path, root: &Path, ctx: &mut Ctx, with_log: bool) -> Value {
    let Some(repo) = find_repo(abs, root, &mut ctx.repo_of) else {
        return empty_git();
    };
    let snap = repo_snapshot(&repo, &mut ctx.snaps);
    let dirty = path_dirty(&repo, abs, &snap.dirty);
    let (badge, label) = decide_badge(true, snap.remote.is_some(), snap.has_upstream, dirty, snap.ahead);
    let commit = if with_log { last_commit(&repo, abs, &snap.head) } else { snap.head.clone() };
    json!({
        "inRepo": true,
        "repoRoot": repo.to_string_lossy(),
        "hasRemote": snap.remote.is_some(),
        "remoteUrl": snap.remote,
        "hasUpstream": snap.has_upstream,
        "dirty": dirty,
        "ahead": snap.ahead,
        "behind": snap.behind,
        "lastCommit": commit.map(|(hash, date, message)| json!({"hash": hash, "date": date, "message": message})),
        "badge": badge,
        "badgeLabel": label
    })
}

fn discover_versions(dir: &Path, rel: &str) -> Vec<Value> {
    let mut versions = Vec::new();
    if has_manifest(dir) {
        let name = dir.file_name().and_then(|value| value.to_str()).unwrap_or("");
        let folder_version = if is_version_name(name) { Some(name) } else { None };
        let manifest = parse_manifest(&dir.join("__manifest__.py"), folder_version);
        let version = manifest.as_ref().and_then(|item| item.get("odooVersion")).and_then(|value| value.as_str()).unwrap_or("").to_string();
        versions.push(json!({"version": version, "relativePath": rel, "manifest": manifest}));
    }
    for child in list_dirs(dir) {
        let Some(name) = child.file_name().and_then(|value| value.to_str()).map(|value| value.to_string()) else { continue };
        if !is_version_dir(&child) { continue; }
        let child_rel = if rel.is_empty() { name.clone() } else { format!("{rel}/{name}") };
        let manifest = parse_manifest(&child.join("__manifest__.py"), Some(&name));
        versions.push(json!({"version": name, "relativePath": child_rel, "manifest": manifest}));
    }
    versions
}

fn build_module(abs: &Path, rel: &str, root: &Path, ctx: &mut Ctx) -> Value {
    let meta = classify(rel);
    let versions = discover_versions(abs, rel);
    let mut version_names: Vec<String> = versions.iter().filter_map(|item| item.get("version").and_then(|value| value.as_str()).filter(|value| !value.is_empty()).map(|value| value.to_string())).collect();
    version_names.sort();
    version_names.dedup();
    let primary = versions.iter().max_by(|left, right| {
        let a = left.get("version").and_then(|value| value.as_str()).unwrap_or("");
        let b = right.get("version").and_then(|value| value.as_str()).unwrap_or("");
        a.cmp(b)
    });
    let manifest = primary.and_then(|item| item.get("manifest"));
    let mapa = pick_mapa(&ctx.mapa, &meta.module_name, rel);
    let estado = mapa.map(|row| row.estado.clone()).filter(|value| !value.is_empty()).unwrap_or_else(|| if meta.category == "archivados" { "archivado".to_string() } else { String::new() });
    let summary = manifest.and_then(|item| item.get("summary")).and_then(|value| value.as_str()).unwrap_or("").trim().to_string();
    json!({
        "name": if meta.module_name.is_empty() { abs.file_name().and_then(|value| value.to_str()).unwrap_or("").to_string() } else { meta.module_name },
        "relativePath": rel,
        "category": meta.category,
        "area": meta.area,
        "tipoNegocio": mapa.map(|row| row.tipo_negocio.clone()).filter(|value| !value.is_empty()).unwrap_or(meta.tipo),
        "cliente": meta.cliente,
        "versions": version_names,
        "estado": estado,
        "manifestName": manifest.and_then(|item| item.get("name")).and_then(|value| value.as_str()).unwrap_or(""),
        "summary": summary,
        "mapa": mapa.map(mapa_json),
        "git": git_info(abs, root, ctx, true)
    })
}

fn walk(abs: &Path, rel: &str, root: &Path, ctx: &mut Ctx, depth: usize) -> Value {
    let name = abs.file_name().and_then(|value| value.to_str()).unwrap_or("").to_string();
    let version_here = is_version_dir(abs);
    let module_here = !version_here && is_module_dir(abs);
    let kind = if version_here { "version" } else if module_here { "module" } else { "folder" };
    let module_root = if kind == "module" {
        Some(rel.to_string())
    } else if kind == "version" {
        Some(rel.rsplit_once('/').map(|(parent, _)| parent.to_string()).unwrap_or_default())
    } else {
        None
    };
    let mut children = Vec::new();
    if depth < 12 && kind != "version" {
        for child in list_dirs(abs) {
            let child_name = child.file_name().and_then(|value| value.to_str()).unwrap_or("").to_string();
            let child_rel = if rel.is_empty() { child_name } else { format!("{rel}/{child_name}") };
            children.push(walk(&child, &child_rel, root, ctx, depth + 1));
        }
    }
    if kind == "module" {
        let module = build_module(abs, rel, root, ctx);
        ctx.modules.push(module);
    }
    let with_log = kind != "folder" || depth <= 2;
    json!({
        "name": if rel.is_empty() { root.file_name().and_then(|value| value.to_str()).unwrap_or("raíz").to_string() } else { name },
        "relativePath": rel,
        "kind": kind,
        "moduleRoot": module_root,
        "git": git_info(abs, root, ctx, with_log),
        "children": children
    })
}

fn buckets(map: HashMap<String, i64>) -> Vec<Value> {
    let mut items: Vec<_> = map.into_iter().filter(|(key, _)| !key.trim().is_empty()).collect();
    items.sort_by(|left, right| right.1.cmp(&left.1).then_with(|| left.0.cmp(&right.0)));
    items.into_iter().map(|(key, count)| json!({"key": key, "count": count})).collect()
}

fn stats(modules: &[Value]) -> Value {
    let mut by_area = HashMap::new();
    let mut by_tipo = HashMap::new();
    let mut by_version = HashMap::new();
    let mut subido = 0;
    let mut cambios = 0;
    let mut no_subido = 0;
    for module in modules {
        if let Some(area) = module.get("area").and_then(|value| value.as_str()).filter(|value| !value.is_empty()) {
            *by_area.entry(area.to_string()).or_insert(0) += 1;
        }
        if let Some(tipo) = module.get("tipoNegocio").and_then(|value| value.as_str()).filter(|value| !value.is_empty()) {
            *by_tipo.entry(tipo.to_string()).or_insert(0) += 1;
        }
        if let Some(versions) = module.get("versions").and_then(|value| value.as_array()) {
            for version in versions {
                if let Some(name) = version.as_str().filter(|value| !value.is_empty()) {
                    *by_version.entry(name.to_string()).or_insert(0) += 1;
                }
            }
        }
        match module.get("git").and_then(|git| git.get("badge")).and_then(|value| value.as_str()) {
            Some("subido") => subido += 1,
            Some("cambios_pendientes") => cambios += 1,
            _ => no_subido += 1,
        }
    }
    json!({
        "totalModules": modules.len(),
        "byArea": buckets(by_area),
        "byTipo": buckets(by_tipo),
        "byVersion": buckets(by_version),
        "gitSubido": subido,
        "gitNoSubido": no_subido,
        "gitCambios": cambios
    })
}

fn assert_root(root: &str) -> Result<PathBuf, String> {
    let trimmed = root.trim();
    if trimmed.is_empty() || trimmed.contains('\0') || !Path::new(trimmed).is_absolute() {
        return Err("La ruta raíz tiene que ser absoluta".to_string());
    }
    let path = PathBuf::from(trimmed);
    if !path.is_dir() {
        return Err(format!("No existe la carpeta: {trimmed}"));
    }
    path.canonicalize().map_err(|err| err.to_string())
}

fn scan_root(root: &Path) -> Result<Value, String> {
    let (mapa, warnings) = load_mapa(root);
    let mut ctx = Ctx { mapa, modules: Vec::new(), repo_of: HashMap::new(), snaps: HashMap::new() };
    let mut tree = walk(root, "", root, &mut ctx, 0);
    if let Some(object) = tree.as_object_mut() {
        object.insert("name".to_string(), json!(root.file_name().and_then(|value| value.to_str()).unwrap_or("raíz")));
    }
    ctx.modules.sort_by(|left, right| {
        left.get("relativePath").and_then(|value| value.as_str()).unwrap_or("").cmp(right.get("relativePath").and_then(|value| value.as_str()).unwrap_or(""))
    });
    let mut areas: Vec<String> = ctx.modules.iter().filter_map(|module| module.get("area").and_then(|value| value.as_str()).filter(|value| !value.is_empty()).map(|value| value.to_string())).collect();
    let mut tipos: Vec<String> = ctx.modules.iter().filter_map(|module| module.get("tipoNegocio").and_then(|value| value.as_str()).filter(|value| !value.is_empty()).map(|value| value.to_string())).collect();
    let mut clientes: Vec<String> = ctx.modules.iter().filter_map(|module| module.get("cliente").and_then(|value| value.as_str()).filter(|value| !value.is_empty()).map(|value| value.to_string())).collect();
    areas.sort(); areas.dedup(); tipos.sort(); tipos.dedup(); clientes.sort(); clientes.dedup();
    let stats = stats(&ctx.modules);
    Ok(json!({
        "available": true,
        "root": root.to_string_lossy(),
        "tree": tree,
        "modules": ctx.modules,
        "stats": stats,
        "areas": areas,
        "tipos": tipos,
        "clientes": clientes,
        "warnings": warnings
    }))
}

fn read_limited(path: &Path) -> Option<String> {
    let file = fs::File::open(path).ok()?;
    let mut buffer = Vec::new();
    use std::io::Read;
    file.take(20000).read_to_end(&mut buffer).ok()?;
    Some(String::from_utf8_lossy(&buffer).to_string())
}

fn find_named(dir: &Path, names: &[&str]) -> Option<Value> {
    for name in names {
        let file = dir.join(name);
        if file.is_file() {
            return Some(json!({"name": name, "text": read_limited(&file).unwrap_or_default()}));
        }
    }
    None
}

fn find_readme(dir: &Path) -> Option<Value> {
    let names = ["README.md", "README.rst", "README.txt"];
    if let Some(found) = find_named(dir, &names) { return Some(found); }
    for child in list_dirs(dir) {
        if child.file_name().and_then(|value| value.to_str()).map(is_version_name).unwrap_or(false) {
            if let Some(found) = find_named(&child, &names) { return Some(found); }
        }
    }
    None
}

fn find_motivo(dir: &Path) -> Option<Value> {
    let entries = fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.to_ascii_lowercase().starts_with("motivo") && name.to_ascii_lowercase().ends_with(".txt") {
            return Some(json!({"name": name, "text": read_limited(&entry.path()).unwrap_or_default()}));
        }
    }
    None
}

fn file_stats(dir: &Path) -> (i64, i64) {
    let mut count = 0;
    let mut bytes = 0;
    let mut stack = vec![dir.to_path_buf()];
    while let Some(current) = stack.pop() {
        let Ok(entries) = fs::read_dir(&current) else { continue };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name == ".git" || name == "__pycache__" { continue; }
            let Ok(kind) = entry.file_type() else { continue };
            if kind.is_symlink() { continue; }
            if kind.is_dir() { stack.push(entry.path()); continue; }
            if kind.is_file() {
                count += 1;
                bytes += entry.metadata().map(|meta| meta.len() as i64).unwrap_or(0);
            }
        }
    }
    (count, bytes)
}

fn resolve_existing(root: &Path, relative: &str) -> Result<PathBuf, String> {
    if relative.split(['/', '\\']).any(|part| part == "..") {
        return Err("La ruta sale de la carpeta raíz".to_string());
    }
    let joined = root.join(relative.trim_start_matches('/'));
    let real = joined.canonicalize().map_err(|_| "No existe la carpeta".to_string())?;
    if !real.starts_with(root) {
        return Err("La ruta sale de la carpeta raíz".to_string());
    }
    Ok(real)
}

fn detail_root(root: &Path, relative: &str) -> Result<Value, String> {
    let abs = if relative.is_empty() { root.to_path_buf() } else { resolve_existing(root, relative)? };
    if !abs.is_dir() { return Err("El módulo tiene que ser una carpeta".to_string()); }
    let module_abs = if is_version_dir(&abs) { abs.parent().unwrap_or(&abs).to_path_buf() } else { abs.clone() };
    let module_rel = rel_posix(root, &module_abs);
    let (mapa, _) = load_mapa(root);
    let mut ctx = Ctx { mapa, modules: Vec::new(), repo_of: HashMap::new(), snaps: HashMap::new() };
    let mut module = build_module(&module_abs, &module_rel, root, &mut ctx);
    if is_version_dir(&abs) {
        if let Some(object) = module.as_object_mut() {
            object.insert("git".to_string(), git_info(&abs, root, &mut ctx, true));
            object.insert("relativePath".to_string(), json!(rel_posix(root, &abs)));
        }
    }
    let manifests = discover_versions(&module_abs, &module_rel);
    let readme = find_readme(&abs).or_else(|| if abs == module_abs { None } else { find_readme(&module_abs) });
    let motivo = find_motivo(&abs).or_else(|| find_motivo(&module_abs));
    let (file_count, total_bytes) = file_stats(&abs);
    let git = module.get("git").cloned().unwrap_or_else(empty_git);
    Ok(json!({
        "available": true,
        "detail": {
            "module": module,
            "manifests": manifests,
            "fileCount": file_count,
            "totalBytes": total_bytes,
            "readme": readme,
            "motivo": motivo,
            "git": git
        }
    }))
}

fn ensure_gitignore(dir: &Path) -> Result<(), String> {
    let file = dir.join(".gitignore");
    let current = if file.is_file() { fs::read_to_string(&file).unwrap_or_default() } else { String::new() };
    if current.is_empty() {
        let body = format!("# Generado por RNV Manager\n{}\n", GITIGNORE_LINES.join("\n"));
        return fs::write(file, body).map_err(|err| err.to_string());
    }
    let missing: Vec<&str> = GITIGNORE_LINES.iter().copied().filter(|line| !current.lines().any(|existing| existing == *line)).collect();
    if missing.is_empty() { return Ok(()); }
    let prefix = if current.ends_with('\n') { current } else { format!("{current}\n") };
    fs::write(file, format!("{prefix}{}\n", missing.join("\n"))).map_err(|err| err.to_string())
}

fn git_identity(cwd: &Path) -> Vec<String> {
    if let Ok((0, stdout, _)) = run("git", &["config", "user.name"], cwd) {
        if !stdout.trim().is_empty() { return Vec::new(); }
    }
    vec!["-c".to_string(), "user.name=RNV Manager".to_string(), "-c".to_string(), "user.email=addons@renace.tech".to_string()]
}

fn repo_root_of(abs: &Path) -> Option<PathBuf> {
    run("git", &["rev-parse", "--show-toplevel"], abs).ok().filter(|(code, _, _)| *code == 0).map(|(_, stdout, _)| PathBuf::from(stdout.trim()))
}

fn open_finder(abs: &Path) -> Result<String, String> {
    let (cmd, args): (&str, Vec<&str>) = if cfg!(target_os = "macos") {
        ("open", vec![abs.to_str().unwrap_or("")])
    } else if cfg!(target_os = "windows") {
        ("explorer", vec![abs.to_str().unwrap_or("")])
    } else {
        ("xdg-open", vec![abs.to_str().unwrap_or("")])
    };
    let (code, _, stderr) = run(cmd, &args, abs)?;
    if code != 0 { return Err(if stderr.is_empty() { "No se pudo abrir la carpeta".to_string() } else { stderr }); }
    Ok(if cfg!(target_os = "macos") { "Carpeta abierta en Finder".to_string() } else { "Carpeta abierta".to_string() })
}

fn open_editor(abs: &Path) -> Result<String, String> {
    if cfg!(target_os = "macos") {
        for app in ["Cursor", "Visual Studio Code"] {
            if run("open", &["-a", app, abs.to_str().unwrap_or("")], abs).map(|(code, _, _)| code == 0).unwrap_or(false) {
                return Ok(format!("Abierto en {app}"));
            }
        }
    }
    for bin in ["cursor", "code"] {
        if run(bin, &[abs.to_str().unwrap_or("")], abs).map(|(code, _, _)| code == 0).unwrap_or(false) {
            return Ok(format!("Abierto en {bin}"));
        }
    }
    open_finder(abs)
}

fn git_init(abs: &Path) -> Result<String, String> {
    if abs.join(".git").exists() { return Err("Esta carpeta ya es un repositorio Git".to_string()); }
    let (code, _, stderr) = run("git", &["init"], abs)?;
    if code != 0 { return Err(if stderr.is_empty() { "git init falló".to_string() } else { stderr }); }
    ensure_gitignore(abs)?;
    Ok("Repositorio Git creado y .gitignore aplicado".to_string())
}

fn git_commit(abs: &Path, message: &str) -> Result<String, String> {
    let repo = repo_root_of(abs).ok_or("Esta carpeta no está dentro de un repositorio Git")?;
    let text = message.trim();
    if text.is_empty() { return Err("Escribe un mensaje de commit".to_string()); }
    if text.len() > 500 { return Err("El mensaje es demasiado largo".to_string()); }
    let rel = {
        let value = rel_posix(&repo, abs);
        if value.is_empty() { ".".to_string() } else { value }
    };
    let (code, _, stderr) = run("git", &["add", "-A", "--", &rel], &repo)?;
    if code != 0 { return Err(if stderr.is_empty() { "No se pudieron preparar los archivos".to_string() } else { stderr }); }
    let staged = run("git", &["diff", "--cached", "--quiet", "--", &rel], &repo).map(|(code, _, _)| code).unwrap_or(1);
    if staged == 0 { return Err("No hay cambios para confirmar".to_string()); }
    let mut args = git_identity(&repo);
    args.extend(["commit".to_string(), "-m".to_string(), text.to_string(), "--".to_string(), rel]);
    let arg_refs: Vec<&str> = args.iter().map(|value| value.as_str()).collect();
    let (code, stdout, stderr) = run("git", &arg_refs, &repo)?;
    if code != 0 { return Err(if stderr.is_empty() { stdout } else { stderr }); }
    Ok("Commit creado".to_string())
}

fn git_push(abs: &Path, remote: &str) -> Result<String, String> {
    let repo = repo_root_of(abs).ok_or("Esta carpeta no está dentro de un repositorio Git")?;
    let url = remote.trim();
    if !is_github_remote(url) {
        return Err("El remoto tiene que ser un repositorio de GitHub por SSH o HTTPS, sin token".to_string());
    }
    let current = run("git", &["remote", "get-url", "origin"], &repo);
    if current.as_ref().map(|(code, _, _)| *code != 0).unwrap_or(true) {
        let (code, _, stderr) = run("git", &["remote", "add", "origin", url], &repo)?;
        if code != 0 { return Err(if stderr.is_empty() { "No se pudo agregar el remoto".to_string() } else { stderr }); }
    } else if current.ok().map(|(_, stdout, _)| stdout.trim() != url).unwrap_or(false) {
        let (code, _, stderr) = run("git", &["remote", "set-url", "origin", url], &repo)?;
        if code != 0 { return Err(if stderr.is_empty() { "No se pudo actualizar el remoto".to_string() } else { stderr }); }
    }
    let output = Command::new("git")
        .args(["push", "-u", "origin", "HEAD"])
        .current_dir(&repo)
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()
        .map_err(|err| err.to_string())?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let text = if stderr.trim().is_empty() { stdout.to_string() } else { stderr.to_string() };
        return Err(if text.trim().is_empty() { "git push falló. Revisa la clave SSH y que el repo exista en GitHub.".to_string() } else { text });
    }
    Ok("Cambios subidos a GitHub".to_string())
}

fn move_dir(from: &Path, to: &Path) -> Result<(), String> {
    if to.exists() { return Err("Ya existe una carpeta en el destino".to_string()); }
    if let Some(parent) = to.parent() { fs::create_dir_all(parent).map_err(|err| err.to_string())?; }
    match fs::rename(from, to) {
        Ok(()) => Ok(()),
        Err(err) if err.raw_os_error() == Some(18) => {
            copy_dir(from, to)?;
            fs::remove_dir_all(from).map_err(|error| error.to_string())?;
            Ok(())
        }
        Err(err) => Err(err.to_string()),
    }
}

fn copy_dir(from: &Path, to: &Path) -> Result<(), String> {
    fs::create_dir_all(to).map_err(|err| err.to_string())?;
    for entry in fs::read_dir(from).map_err(|err| err.to_string())? {
        let entry = entry.map_err(|err| err.to_string())?;
        let target = to.join(entry.file_name());
        if entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false) {
            copy_dir(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), target).map_err(|err| err.to_string())?;
        }
    }
    Ok(())
}

fn destination_for(root: &Path, module_name: &str, category_path: &str) -> Result<PathBuf, String> {
    let cleaned = category_path.trim().trim_matches('/');
    if cleaned.is_empty() || cleaned.split('/').any(|part| part == "..") {
        return Err("Destino inválido".to_string());
    }
    let allowed = cleaned == "_revisar"
        || cleaned == "_archivados"
        || (cleaned.starts_with("comunes/") && cleaned.matches('/').count() == 1)
        || (cleaned.starts_with("clientes/") && cleaned.matches('/').count() == 2);
    if !allowed {
        return Err("El destino tiene que ser comunes/<área>, clientes/<tipo>/<cliente>, _revisar o _archivados".to_string());
    }
    let folder = if cleaned == "_archivados" { format!("_archivados/{module_name}") } else { format!("{cleaned}/{module_name}") };
    let target = root.join(&folder);
    if target.exists() {
        let real = target.canonicalize().map_err(|err| err.to_string())?;
        if !real.starts_with(root) { return Err("La ruta sale de la carpeta raíz".to_string()); }
    }
    Ok(target)
}

fn update_location(root: &Path, module_name: &str, from_rel: &str, to_rel: &str, estado: Option<&str>, reemplazado: Option<&str>) -> Result<(), String> {
    let (mut rows, _) = load_mapa(root);
    let from_key = area_or_client(from_rel);
    let to_key = area_or_client(to_rel);
    let to_meta = classify(to_rel);
    let mut touched = 0;
    for row in &mut rows {
        let matches = row.module == module_name && (row.area_or_client == from_key || row.area_or_client == format!("{from_key}/{module_name}"));
        if !matches { continue; }
        touched += 1;
        row.area_or_client = to_key.clone();
        row.tipo_negocio = if to_meta.category == "clientes" {
            to_meta.tipo.clone()
        } else if to_meta.category == "comunes" {
            String::new()
        } else {
            row.tipo_negocio.clone()
        };
        row.estado = estado.map(|value| value.to_string()).unwrap_or_else(|| {
            if to_meta.category == "archivados" { "archivado".to_string() } else if row.estado == "archivado" { "keeper".to_string() } else { row.estado.clone() }
        });
        if let Some(value) = reemplazado { row.reemplazado_por = value.to_string(); }
    }
    if touched == 0 {
        rows.push(MapaRow {
            module: module_name.to_string(),
            area_or_client: to_key,
            tipo_negocio: to_meta.tipo,
            versions: String::new(),
            clients_using: String::new(),
            ubicaciones: String::new(),
            estado: estado.unwrap_or(if to_meta.category == "archivados" { "archivado" } else { "keeper" }).to_string(),
            reemplazado_por: reemplazado.unwrap_or("").to_string(),
            clientes_a_migrar: String::new(),
            familia: String::new(),
            instalado_en_clientes: String::new(),
        });
    }
    write_mapa(root, &rows)
}

fn move_module(root: &Path, relative: &str, category_path: &str, estado: Option<&str>, reemplazado: Option<&str>) -> Result<String, String> {
    let abs = resolve_existing(root, relative)?;
    let module_abs = if is_version_dir(&abs) { abs.parent().unwrap_or(&abs).to_path_buf() } else { abs };
    let from_rel = rel_posix(root, &module_abs);
    let module_name = module_abs.file_name().and_then(|value| value.to_str()).unwrap_or("").to_string();
    let target = destination_for(root, &module_name, category_path)?;
    if target == module_abs { return Err("El módulo ya está en ese lugar".to_string()); }
    move_dir(&module_abs, &target)?;
    let to_rel = rel_posix(root, &target);
    update_location(root, &module_name, &from_rel, &to_rel, estado, reemplazado)?;
    Ok(to_rel)
}

fn write_motivo(dir: &Path, motivo: &str, reemplazado: &str, previous: &str) -> Result<(), String> {
    let body = format!(
        "Motivo: {}\nReemplazado por: {}\nUbicación anterior: {}\nArchivado: {}\nRestaurar: mover esta carpeta de vuelta a la ubicación anterior.\n",
        if motivo.trim().is_empty() { "Archivado desde RNV Manager" } else { motivo.trim() },
        if reemplazado.trim().is_empty() { "—" } else { reemplazado.trim() },
        previous,
        chrono_like_now()
    );
    fs::write(dir.join("MOTIVO.txt"), body).map_err(|err| err.to_string())
}

fn chrono_like_now() -> String {
    let output = Command::new("date").arg("-u").arg("+%Y-%m-%dT%H:%M:%SZ").output();
    output.ok().filter(|result| result.status.success()).map(|result| String::from_utf8_lossy(&result.stdout).trim().to_string()).unwrap_or_else(|| "ahora".to_string())
}

fn export_zip(abs: &Path) -> Result<PathBuf, String> {
    let name = abs.file_name().and_then(|value| value.to_str()).unwrap_or("modulo");
    let home = std::env::var("HOME").unwrap_or_else(|_| std::env::temp_dir().to_string_lossy().to_string());
    let downloads = PathBuf::from(&home).join("Downloads");
    let folder = if downloads.is_dir() { downloads } else { std::env::temp_dir() };
    let dest = folder.join(format!("{name}.zip"));
    let script = r#"
import os, sys, zipfile, fnmatch
root, dest = sys.argv[1], sys.argv[2]
def skip(rel):
    base = os.path.basename(rel)
    if base.endswith('.pyc') or '__pycache__' in rel.split(os.sep):
        return True
    return fnmatch.fnmatch(base, '*RNC_Contribuyentes*.csv')
with zipfile.ZipFile(dest, 'w', zipfile.ZIP_DEFLATED) as zf:
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in ('.git', '__pycache__')]
        for filename in filenames:
            full = os.path.join(dirpath, filename)
            if skip(os.path.relpath(full, root)):
                continue
            zf.write(full, os.path.relpath(full, os.path.dirname(root)))
"#;
    let output = Command::new("python3")
        .arg("-c")
        .arg(script)
        .arg(abs)
        .arg(&dest)
        .output()
        .map_err(|err| err.to_string())?;
    if !output.status.success() || !dest.is_file() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(dest)
}

fn require_confirm(payload: &Value) -> Result<(), String> {
    if payload.get("confirm").and_then(|value| value.as_bool()) != Some(true) {
        return Err("Esta acción necesita confirmación".to_string());
    }
    Ok(())
}

fn action_result(ok: bool, message: String) -> Value {
    json!({"available": true, "ok": ok, "message": message})
}

fn perform_action(root: &Path, action: &str, payload: &Value) -> Result<Value, String> {
    let relative = payload.get("relativePath").and_then(|value| value.as_str()).unwrap_or("");
    if action == "open" || action == "editor" {
        let abs = resolve_existing(root, relative)?;
        let message = if action == "editor" { open_editor(&abs)? } else { open_finder(&abs)? };
        return Ok(action_result(true, message));
    }
    require_confirm(payload)?;
    let abs = resolve_existing(root, relative)?;
    let message = match action {
        "git_init" => git_init(&abs)?,
        "commit" => git_commit(&abs, payload.get("message").and_then(|value| value.as_str()).unwrap_or(""))?,
        "push" => git_push(&abs, payload.get("remote").and_then(|value| value.as_str()).unwrap_or(""))?,
        "move" | "archive" | "restore" => {
            let destination = if action == "archive" { "_archivados".to_string() } else { payload.get("destination").and_then(|value| value.as_str()).unwrap_or("").to_string() };
            if destination.is_empty() { return Err("Falta el destino".to_string()); }
            let estado = if action == "archive" { Some("archivado") } else if action == "restore" { Some("keeper") } else { None };
            let reemplazado = payload.get("reemplazadoPor").and_then(|value| value.as_str());
            let from_rel = rel_posix(root, if is_version_dir(&abs) { abs.parent().unwrap_or(&abs) } else { &abs });
            let to_rel = move_module(root, relative, &destination, estado, reemplazado)?;
            if action == "archive" {
                write_motivo(&root.join(&to_rel), payload.get("motivo").and_then(|value| value.as_str()).unwrap_or(""), reemplazado.unwrap_or(""), &from_rel)?;
            }
            let verb = if action == "archive" { "archivado" } else if action == "restore" { "restaurado" } else { "movido" };
            format!("Módulo {verb} a {to_rel}. mapa.csv actualizado.")
        }
        "export" => {
            let module_abs = if is_version_dir(&abs) { abs.parent().unwrap_or(&abs).to_path_buf() } else { abs.clone() };
            let saved = export_zip(&module_abs)?;
            format!("ZIP guardado en {}", saved.to_string_lossy())
        }
        _ => return Err("Acción desconocida".to_string()),
    };
    Ok(action_result(true, message))
}

fn user_error(error: String) -> Value {
    json!({"available": true, "ok": false, "message": error})
}

#[tauri::command]
pub fn addons_scan(root: String) -> Result<Value, String> {
    let path = match assert_root(&root) {
        Ok(path) => path,
        Err(error) => return Ok(json!({"available": true, "message": error})),
    };
    scan_root(&path).or_else(|error| Ok(json!({"available": true, "message": error})))
}

#[tauri::command]
pub fn addons_detail(root: String, relative_path: String) -> Result<Value, String> {
    let path = match assert_root(&root) {
        Ok(path) => path,
        Err(error) => return Ok(json!({"available": false, "message": error})),
    };
    detail_root(&path, &relative_path).or_else(|error| Ok(json!({"available": true, "message": error})))
}

#[tauri::command]
pub fn addons_action(root: String, action: String, payload: Value) -> Result<Value, String> {
    let path = match assert_root(&root) {
        Ok(path) => path,
        Err(error) => return Ok(user_error(error)),
    };
    perform_action(&path, &action, &payload).or_else(|error| Ok(user_error(error)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn badge_and_github_remote() {
        assert_eq!(decide_badge(false, false, false, false, 0).0, "no_subido");
        assert_eq!(decide_badge(true, true, true, true, 0).0, "cambios_pendientes");
        assert_eq!(decide_badge(true, true, true, false, 0).0, "subido");
        assert!(is_github_remote("git@github.com:renace/ncf.git"));
        assert!(is_github_remote("https://github.com/renace/ncf.git"));
        assert!(!is_github_remote("https://user:ghp_abc@github.com/renace/ncf.git"));
    }

    #[test]
    fn scans_fixture_modules() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../fixtures/addons-organizado");
        let root = root.canonicalize().expect("fixture");
        let scan = scan_root(&root).expect("scan");
        assert_eq!(scan["stats"]["totalModules"], 7);
        let modules = scan["modules"].as_array().expect("modules");
        let ncf = modules.iter().find(|module| module["name"] == "ncf").expect("ncf");
        assert_eq!(ncf["manifestName"], "NCF República Dominicana");
        assert_eq!(ncf["estado"], "keeper");
        assert_eq!(ncf["git"]["badge"], "no_subido");
        let archived = modules.iter().find(|module| module["name"] == "custompos_receipt").expect("archivado");
        assert_eq!(archived["estado"], "archivado");
        let detail = detail_root(&root, "_archivados/custompos_receipt").expect("detail");
        assert!(detail["detail"]["motivo"]["text"].as_str().unwrap_or("").contains("custom_receipts_for_pos"));
    }
}
