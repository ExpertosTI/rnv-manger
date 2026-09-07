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

#[tauri::command]
fn open_whiteboard(app: tauri::AppHandle) {
    use tauri_plugin_shell::ShellExt;
    let _ = app.shell().open("https://rnv.renace.tech/whiteboard-app/index.html", None);
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(|app| {
            let handle = app.handle();

            // Menú contextual mínimo para clic secundario / opciones
            let nav_assistant = MenuItem::with_id(handle, "nav_assistant", "💬 Asistente IA (Chat)", true, None::<&str>)?;
            let show          = MenuItem::with_id(handle, "show",          "🖥️ Mostrar RNV Manager", true, None::<&str>)?;
            let nav_reload    = MenuItem::with_id(handle, "nav_reload",    "🔄 Recargar",             true, None::<&str>)?;
            let sep           = PredefinedMenuItem::separator(handle)?;
            let quit          = MenuItem::with_id(handle, "quit",          "Salir de RNV Manager",    true, None::<&str>)?;

            let tray_menu = Menu::with_items(
                handle,
                &[&nav_assistant, &show, &nav_reload, &sep, &quit],
            )?;

            let tray_icon = app.default_window_icon().cloned().expect("no default window icon");

            let _tray = TrayIconBuilder::with_id("tray_main")
                .icon(tray_icon)
                .icon_as_template(false)
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .tooltip("RNV Manager - Asistente IA")
                .on_menu_event(move |app, event| {
                    let win = app.get_webview_window("main");
                    match event.id().as_ref() {
                        "quit" => app.exit(0),
                        "show" => {
                            if let Some(w) = &win { let _ = w.show(); let _ = w.unminimize(); let _ = w.set_focus(); }
                        }
                        "nav_assistant" => {
                            if let Some(w) = &win {
                                let _ = w.show();
                                let _ = w.unminimize();
                                let _ = w.set_focus();
                                let _ = w.eval("window.dispatchEvent(new CustomEvent('rnv-ai-open'))");
                            }
                        }
                        "nav_reload" => {
                            if let Some(w) = &win { let _ = w.eval("window.location.reload()"); }
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.unminimize();
                            let _ = w.set_focus();
                            let _ = w.eval("window.dispatchEvent(new CustomEvent('rnv-ai-open'))");
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![navigate_to, show_notification, open_whiteboard])
        .run(tauri::generate_context!())
        .expect("error while running RNV Manager");
}
