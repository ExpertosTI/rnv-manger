import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { detailAddons, decideBadge, isGithubRemote, parseManifestSource, runAction, scanAddons } from "./engine";
import { GITIGNORE_LINES } from "./types";

const FIXTURE = path.resolve(process.cwd(), "fixtures/addons-organizado");

function git(cwd: string, args: string[]) {
    const res = spawnSync("git", args, {
        cwd,
        encoding: "utf8",
        env: {
            ...process.env,
            GIT_AUTHOR_NAME: "RNV Test",
            GIT_AUTHOR_EMAIL: "addons@renace.tech",
            GIT_COMMITTER_NAME: "RNV Test",
            GIT_COMMITTER_EMAIL: "addons@renace.tech",
            GIT_TERMINAL_PROMPT: "0",
        },
    });
    if (res.status !== 0) {
        throw new Error(`${args.join(" ")}\n${res.stderr || res.stdout}`);
    }
}

function copyFixture(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rnv-addons-"));
    fs.cpSync(FIXTURE, dir, { recursive: true });
    return dir;
}

function seedGit(root: string) {
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), "rnv-bare-"));
    const ncfBare = path.join(bare, "ncf.git");
    const licBare = path.join(bare, "licoreria.git");
    git(bare, ["init", "--bare", ncfBare]);
    git(bare, ["init", "--bare", licBare]);

    const ncf = path.join(root, "comunes/fiscal_rd/ncf");
    git(ncf, ["init"]);
    git(ncf, ["add", "-A"]);
    git(ncf, ["commit", "-m", "ncf inicial"]);
    git(ncf, ["remote", "add", "origin", ncfBare]);
    git(ncf, ["push", "-u", "origin", "HEAD"]);

    const price = path.join(root, "comunes/pos/pos_min_price");
    fs.writeFileSync(path.join(price, ".gitignore"), `${GITIGNORE_LINES.join("\n")}\n`);
    git(price, ["init"]);
    git(price, ["add", "-A"]);
    git(price, ["commit", "-m", "precio minimo"]);
    fs.appendFileSync(path.join(price, "__init__.py"), "\n# cambio local\n");

    const lic = path.join(root, "clientes/licoreria");
    git(lic, ["init"]);
    git(lic, ["add", "-A"]);
    git(lic, ["commit", "-m", "grupo licoreria"]);
    git(lic, ["remote", "add", "origin", licBare]);
    git(lic, ["push", "-u", "origin", "HEAD"]);
}

test("parsea el manifest y decide la insignia git", () => {
    const manifest = parseManifestSource(fs.readFileSync(path.join(FIXTURE, "comunes/fiscal_rd/ncf/18.0/__manifest__.py"), "utf8"));
    assert.equal(manifest?.name, "NCF República Dominicana");
    assert.deepEqual(manifest?.depends, ["account", "point_of_sale"]);
    assert.equal(manifest?.license, "LGPL-3");
    assert.equal(decideBadge({ inRepo: false, hasRemote: false, hasUpstream: false, dirty: false, ahead: 0 }).badge, "no_subido");
    assert.equal(decideBadge({ inRepo: true, hasRemote: true, hasUpstream: true, dirty: true, ahead: 0 }).badge, "cambios_pendientes");
    assert.equal(decideBadge({ inRepo: true, hasRemote: true, hasUpstream: true, dirty: false, ahead: 0 }).badge, "subido");
    assert.equal(isGithubRemote("git@github.com:renace/ncf.git"), true);
    assert.equal(isGithubRemote("https://user:ghp_abc@github.com/renace/ncf.git"), false);
    assert.equal(isGithubRemote("https://github.com/renace/ncf.git"), true);
});

test("escanea el árbol de ejemplo, el detalle y las acciones", () => {
    const root = copyFixture();
    seedGit(root);
    const previousRoots = process.env.RNV_ADDONS_ROOTS;
    process.env.RNV_ADDONS_ROOTS = root;
    const scan = scanAddons(root);
    assert.equal(scan.available, true);
    assert.equal(scan.stats?.totalModules, 7);
    const byName = new Map((scan.modules || []).map((module) => [module.name, module]));
    assert.equal(byName.get("ncf")?.git.badge, "subido");
    assert.deepEqual([...(byName.get("ncf")?.versions || [])].sort(), ["16.0", "18.0"]);
    assert.equal(byName.get("ncf")?.mapa?.estado, "keeper");
    assert.ok(byName.get("ncf")?.mapa?.clientsUsing.includes("bloke"));
    assert.equal(byName.get("pos_min_price")?.git.badge, "cambios_pendientes");
    assert.equal(byName.get("pos_all_orders")?.git.badge, "subido");
    assert.equal(byName.get("pos_all_orders")?.tipoNegocio, "licoreria");
    assert.equal(byName.get("pos_all_orders")?.cliente, "mojo");
    assert.equal(byName.get("petty_cash_management")?.git.badge, "no_subido");
    assert.equal(byName.get("petty_cash_management")?.git.inRepo, false);
    assert.equal(byName.get("custompos_receipt")?.estado, "archivado");
    assert.equal(scan.stats?.gitSubido, 2);
    assert.equal(scan.stats?.gitCambios, 1);
    assert.equal(scan.stats?.gitNoSubido, 4);
    assert.ok(scan.tree?.children.some((child) => child.name === "comunes"));

    const detail = detailAddons(root, "comunes/fiscal_rd/ncf");
    assert.equal(detail.detail?.readme?.name, "README.md");
    assert.ok((detail.detail?.fileCount || 0) >= 4);
    assert.match(detail.detail?.manifests.find((item) => item.version === "18.0")?.manifest?.description || "", /Odoo 18/);

    const archived = detailAddons(root, "_archivados/custompos_receipt");
    assert.match(archived.detail?.motivo?.text || "", /custom_receipts_for_pos/);

    assert.throws(() => detailAddons(root, "../"), /sale de la carpeta/);

    const init = runAction({ root, action: "git_init", relativePath: "clientes/restaurante_bar/altamar/petty_cash_management", confirm: true });
    assert.equal("ok" in init && init.ok, true);
    const ignore = fs.readFileSync(path.join(root, "clientes/restaurante_bar/altamar/petty_cash_management/.gitignore"), "utf8");
    for (const line of GITIGNORE_LINES) assert.match(ignore, new RegExp(line.replace(/[.*]/g, "\\$&")));

    const commit = runAction({
        root,
        action: "commit",
        relativePath: "comunes/pos/pos_min_price",
        message: "Ajuste local",
        confirm: true,
    });
    assert.equal("ok" in commit && commit.ok, true);

    const moved = runAction({
        root,
        action: "move",
        relativePath: "comunes/inventario/stock_last_purchase_price",
        destination: "comunes/utilidades",
        confirm: true,
    });
    assert.equal("ok" in moved && moved.ok, true);
    assert.equal(fs.existsSync(path.join(root, "comunes/utilidades/stock_last_purchase_price/__manifest__.py")), true);
    const mapa = fs.readFileSync(path.join(root, "mapa.csv"), "utf8");
    assert.match(mapa, /stock_last_purchase_price,comunes\/utilidades,/);

    const archivedMove = runAction({
        root,
        action: "archive",
        relativePath: "_revisar/custom_receipts_for_pos",
        motivo: "Autoría dudosa",
        reemplazadoPor: "custom_receipts_for_pos",
        confirm: true,
    });
    assert.equal("ok" in archivedMove && archivedMove.ok, true);
    const motivo = fs.readFileSync(path.join(root, "_archivados/custom_receipts_for_pos/MOTIVO.txt"), "utf8");
    assert.match(motivo, /Autoría dudosa/);
    assert.match(fs.readFileSync(path.join(root, "mapa.csv"), "utf8"), /custom_receipts_for_pos,_archivados\/custom_receipts_for_pos,.*archivado/);

    const restored = runAction({
        root,
        action: "restore",
        relativePath: "_archivados/custompos_receipt",
        destination: "clientes/boutique_ropa/cueromacho",
        confirm: true,
    });
    assert.equal("ok" in restored && restored.ok, true);
    assert.equal(fs.existsSync(path.join(root, "clientes/boutique_ropa/cueromacho/custompos_receipt/__manifest__.py")), true);

    const zip = runAction({ root, action: "export", relativePath: "comunes/pos/pos_min_price", confirm: true });
    assert.ok("zipPath" in zip);
    if ("zipPath" in zip) {
        const listed = spawnSync("python3", ["-c", "import sys,zipfile; print('\\n'.join(zipfile.ZipFile(sys.argv[1]).namelist()))", zip.zipPath], { encoding: "utf8" });
        assert.equal(listed.status, 0);
        assert.match(listed.stdout, /__manifest__\.py/);
        assert.doesNotMatch(listed.stdout, /RNC_Contribuyentes/);
        fs.rmSync(zip.zipPath, { force: true });
    }

    assert.throws(
        () => runAction({ root, action: "push", relativePath: "comunes/fiscal_rd/ncf", remote: "https://user:ghp_secret@github.com/renace/ncf.git", confirm: true }),
        /sin token|GitHub/
    );
    assert.throws(() => detailAddons(root, "comunes/../../etc"), /sale de la carpeta/);
    assert.throws(
        () => runAction({ root, action: "move", relativePath: "comunes/pos/pos_min_price", destination: "../.ssh", confirm: true }),
        /Destino inválido|no está permitida|sale de la carpeta/
    );
    if (previousRoots === undefined) delete process.env.RNV_ADDONS_ROOTS;
    else process.env.RNV_ADDONS_ROOTS = previousRoots;
});
