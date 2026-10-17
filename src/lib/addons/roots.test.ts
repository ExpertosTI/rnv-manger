import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { detailAddons, scanAddons } from "./engine";
import { parseAddonsRoots, resolveAllowedRoot } from "./roots";

test("separa raíces por coma o dos puntos", () => {
    assert.deepEqual(parseAddonsRoots("/data/a:/data/b,/data/c"), ["/data/a", "/data/b", "/data/c"]);
    assert.deepEqual(parseAddonsRoots("  /data/a , /data/b "), ["/data/a", "/data/b"]);
    assert.deepEqual(parseAddonsRoots(""), []);
    assert.deepEqual(parseAddonsRoots(undefined), []);
});

test("solo acepta una raíz de la lista, tras realpath", { concurrency: false }, () => {
    const allowed = fs.mkdtempSync(path.join(os.tmpdir(), "rnv-root-"));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "rnv-out-"));
    const linkToAllowed = path.join(os.tmpdir(), `rnv-link-ok-${Date.now()}`);
    const linkToOutside = path.join(os.tmpdir(), `rnv-link-bad-${Date.now()}`);
    fs.symlinkSync(allowed, linkToAllowed);
    fs.symlinkSync(outside, linkToOutside);
    fs.mkdirSync(path.join(allowed, "mod"));
    fs.writeFileSync(path.join(outside, "secret.txt"), "no");
    fs.symlinkSync(outside, path.join(allowed, "escape"));
    const previous = process.env.RNV_ADDONS_ROOTS;
    process.env.RNV_ADDONS_ROOTS = `${allowed}:${outside}/no-such`;
    try {
        assert.equal(resolveAllowedRoot(allowed), fs.realpathSync(allowed));
        assert.equal(resolveAllowedRoot(linkToAllowed), fs.realpathSync(allowed));
        assert.equal(resolveAllowedRoot(""), fs.realpathSync(allowed));
        assert.throws(() => resolveAllowedRoot(outside), /no está permitida|no existe/);
        assert.throws(() => resolveAllowedRoot(linkToOutside), /no está permitida|no existe/);
        assert.throws(() => resolveAllowedRoot(path.join(allowed, "..", path.basename(outside))), /no está permitida|no existe/);
        assert.throws(() => scanAddons(outside), /no está permitida|no existe/);
        assert.throws(() => detailAddons(allowed, "escape"), /sale de la carpeta/);
        assert.throws(() => detailAddons(allowed, "mod/../../" + path.basename(outside)), /sale de la carpeta/);
    } finally {
        if (previous === undefined) delete process.env.RNV_ADDONS_ROOTS;
        else process.env.RNV_ADDONS_ROOTS = previous;
        fs.rmSync(linkToAllowed, { force: true });
        fs.rmSync(linkToOutside, { force: true });
        fs.rmSync(allowed, { recursive: true, force: true });
        fs.rmSync(outside, { recursive: true, force: true });
    }
});

test("sin RNV_ADDONS_ROOTS no abre ninguna carpeta", { concurrency: false }, () => {
    const previous = process.env.RNV_ADDONS_ROOTS;
    delete process.env.RNV_ADDONS_ROOTS;
    try {
        assert.throws(() => resolveAllowedRoot("/tmp"), /RNV_ADDONS_ROOTS/);
    } finally {
        if (previous === undefined) delete process.env.RNV_ADDONS_ROOTS;
        else process.env.RNV_ADDONS_ROOTS = previous;
    }
});
