import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

test("el redirect de login es relativo y no usa el host interno", () => {
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
    assert.equal(location, "/login?redirect=%2Faddons");
    assert.ok(location && !location.startsWith("http"));
});

test("una cookie con forma de sesión no redirige", () => {
    const session = `${"a".repeat(24)}.bbbbbbbb.cccccccc`;
    const request = new NextRequest("http://127.0.0.1:3000/settings", {
        headers: { cookie: `rnv_session=${session}` },
    });
    const response = middleware(request);
    assert.equal(response.headers.get("location"), null);
});
