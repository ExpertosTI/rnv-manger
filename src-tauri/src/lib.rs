use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

#[tauri::command]
fn navigate_to(window: tauri::WebviewWindow, path: String) {
    let base = "https://rnv.renace.tech";
    let url = format!("{}{}", base, path);
    let _ = window.navigate(url.parse().unwrap());
}

#[tauri::command]
fn show_notification(app: tauri::AppHandle, title: String, body: String) {
    use tauri_plugin_notification::NotificationExt;
    let _ = app.notification().builder().title(title).body(body).show();
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            // ── Menú nativo de la aplicación ──────────────────────────────
            let handle = app.handle();

            // Tray icon
            let quit = MenuItem::with_id(handle, "quit", "Salir de RNV Manager", true, None::<&str>)?;
            let show = MenuItem::with_id(handle, "show", "Mostrar RNV Manager", true, None::<&str>)?;
            let sep  = PredefinedMenuItem::separator(handle)?;

            // Navegación rápida desde el tray
            let nav_dashboard = MenuItem::with_id(handle, "nav_dashboard", "⚡ Monitor Principal", true, None::<&str>)?;
            let nav_vps       = MenuItem::with_id(handle, "nav_vps",       "🖥️ Servidores VPS",   true, None::<&str>)?;
            let nav_services  = MenuItem::with_id(handle, "nav_services",  "🌐 Servicios & Endpoints", true, None::<&str>)?;
            let nav_clients   = MenuItem::with_id(handle, "nav_clients",   "👥 Clientes",         true, None::<&str>)?;
            let nav_billing   = MenuItem::with_id(handle, "nav_billing",   "💳 Facturación",      true, None::<&str>)?;
            let nav_whatsapp  = MenuItem::with_id(handle, "nav_whatsapp",  "💬 WhatsApp / EvoAPI", true, None::<&str>)?;
            let nav_map       = MenuItem::with_id(handle, "nav_map",       "🗺️ Mapa Topología",   true, None::<&str>)?;
            let nav_audit     = MenuItem::with_id(handle, "nav_audit",     "🛡️ Auditoría",        true, None::<&str>)?;
            let nav_settings  = MenuItem::with_id(handle, "nav_settings",  "⚙️ Ajustes",          true, None::<&str>)?;
            let nav_reload    = MenuItem::with_id(handle, "nav_reload",    "🔄 Recargar Panel",   true, None::<&str>)?;
            let nav_sep       = PredefinedMenuItem::separator(handle)?;

            let tray_menu = Menu::with_items(
                handle,
                &[
                    &show, &nav_reload, &sep,
                    &nav_dashboard, &nav_vps, &nav_services,
                    &nav_clients, &nav_billing, &nav_whatsapp,
                    &nav_map, &nav_audit, &nav_settings,
                    &nav_sep, &quit
                ],
            )?;

            let _tray = TrayIconBuilder::new()
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| {
                    let win = app.get_webview_window("main");
                    match event.id().as_ref() {
                        "quit" => app.exit(0),
                        "show" => {
                            if let Some(w) = &win { let _ = w.show(); let _ = w.set_focus(); }
                        }
                        "nav_reload" => {
                            if let Some(w) = &win { let _ = w.eval("window.location.reload()"); }
                        }
                        "nav_dashboard" => { if let Some(w) = &win { let _ = w.show(); let _ = w.navigate("https://rnv.renace.tech/".parse().unwrap()); } }
                        "nav_vps"       => { if let Some(w) = &win { let _ = w.show(); let _ = w.navigate("https://rnv.renace.tech/vps".parse().unwrap()); } }
                        "nav_services"  => { if let Some(w) = &win { let _ = w.show(); let _ = w.navigate("https://rnv.renace.tech/services".parse().unwrap()); } }
                        "nav_clients"   => { if let Some(w) = &win { let _ = w.show(); let _ = w.navigate("https://rnv.renace.tech/clients".parse().unwrap()); } }
                        "nav_billing"   => { if let Some(w) = &win { let _ = w.show(); let _ = w.navigate("https://rnv.renace.tech/billing".parse().unwrap()); } }
                        "nav_whatsapp"  => { if let Some(w) = &win { let _ = w.show(); let _ = w.navigate("https://rnv.renace.tech/whatsapp".parse().unwrap()); } }
                        "nav_map"       => { if let Some(w) = &win { let _ = w.show(); let _ = w.navigate("https://rnv.renace.tech/map".parse().unwrap()); } }
                        "nav_audit"     => { if let Some(w) = &win { let _ = w.show(); let _ = w.navigate("https://rnv.renace.tech/audit".parse().unwrap()); } }
                        "nav_settings"  => { if let Some(w) = &win { let _ = w.show(); let _ = w.navigate("https://rnv.renace.tech/settings".parse().unwrap()); } }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![navigate_to, show_notification])
        .run(tauri::generate_context!())
        .expect("error while running RNV Manager");
}
