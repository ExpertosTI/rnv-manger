import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

test("un visitante sin sesión recibe 307 al host público", () => {
    const request = new NextRequest("http://127.0.0.1:3000/addons", {
        headers: {
            host: "127.0.0.1:3000",
            "x-forwarded-host": "rnv.renace.tech",
            "x-forwarded-proto": "https",
        },
    });
    const response = middleware(request);
    const location = response.headers.get("location");
    assert.equal(response.status, 307);
    assert.equal(location, "https://rnv.renace.tech/login?redirect=%2Faddons");
});

test("una cookie con forma de sesión no redirige", () => {
    const session = `${"a".repeat(24)}.bbbbbbbb.cccccccc`;
    const request = new NextRequest("http://127.0.0.1:3000/settings", {
        headers: { cookie: `rnv_session=${session}` },
    });
    const response = middleware(request);
    assert.equal(response.headers.get("location"), null);
});
