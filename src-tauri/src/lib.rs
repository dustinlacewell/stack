use std::collections::{HashMap, HashSet};
use std::sync::Mutex;

use tauri_plugin_log::log::{error, info, warn};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

// Global-shortcut ownership lives here, in Rust, on purpose.
//
// The frontend used to call the plugin's `register`/`unregister` commands
// directly from an effect. That's fine in steady state, but every HMR reload
// or page refresh tears down the JS world while the Rust process keeps
// running — so the OS-level registrations stick around with dead JS
// callbacks behind them. The next `register()` from the fresh page comes
// back "already registered" and the window is effectively locked out until
// the whole app is killed.
//
// By making Rust the source of truth, a reload becomes a no-op: the JS side
// just invokes `set_shortcuts` with its current plan and we reconcile
// in-process. No cross-lifetime state.

#[derive(Default)]
pub struct ShortcutRegistry {
    // keyed by the global-hotkey id (derived from modifiers+code), since
    // that's what the plugin hands us in the event callback. The value is
    // the action id to emit on press.
    active: Mutex<HashMap<u32, String>>,
}

#[derive(Debug, serde::Deserialize)]
pub struct ShortcutRequest {
    action: String,
    accel: String,
    /// Whether this accel is a default-binding fallback for an overridden
    /// action. Reported back so the UI can explain why the user's chosen
    /// combo didn't take.
    fallback: bool,
}

#[derive(Debug, serde::Serialize)]
pub struct ShortcutOutcome {
    action: String,
    accel: String,
    succeeded: bool,
    fallback: bool,
    error: Option<String>,
}

#[tauri::command]
fn toggle_stack(app: AppHandle) -> Result<(), String> {
    let Some(win) = app.get_webview_window("main") else {
        return Err("main window missing".into());
    };
    let visible = win.is_visible().map_err(|e| e.to_string())?;
    if visible {
        win.hide().map_err(|e| e.to_string())?;
    } else {
        win.show().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn show_stack(app: AppHandle) -> Result<(), String> {
    let Some(win) = app.get_webview_window("main") else {
        return Err("main window missing".into());
    };
    win.show().map_err(|e| e.to_string())?;
    win.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn hide_stack(app: AppHandle) -> Result<(), String> {
    let Some(win) = app.get_webview_window("main") else {
        return Err("main window missing".into());
    };
    win.hide().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn set_shortcuts(
    app: AppHandle,
    registry: State<'_, ShortcutRegistry>,
    requests: Vec<ShortcutRequest>,
) -> Result<Vec<ShortcutOutcome>, String> {
    let gs = app.global_shortcut();
    info!("set_shortcuts: {} request(s)", requests.len());

    // Clear everything we currently hold. `unregister_all` on the plugin
    // walks its own map, so even if our registry got desynced somehow the
    // OS state goes back to a known-clean baseline.
    if let Err(err) = gs.unregister_all() {
        warn!("unregister_all failed: {err}");
    }
    registry
        .active
        .lock()
        .map_err(|e| e.to_string())?
        .clear();

    let mut outcomes: Vec<ShortcutOutcome> = Vec::with_capacity(requests.len());
    // Two actions cannot share an accel. First-in wins; later attempts get
    // a "claimed" failure so the UI can surface the conflict.
    let mut claimed: HashMap<String, String> = HashMap::new();
    let mut new_active: HashMap<u32, String> = HashMap::new();
    // Fallback semantics: the JS side appends the default combos after the
    // user's overrides so a broken override can't lock the app out. Once
    // *any* primary (non-fallback) request for an action has succeeded, the
    // fallbacks are redundant — silently skip them so the UI doesn't see
    // spurious "fallback in use" or "failed" outcomes for collisions that
    // never mattered.
    let mut primary_succeeded: HashSet<String> = HashSet::new();

    // Requests come ordered: all primaries for action X, then X's fallbacks.
    for req in requests {
        if req.fallback && primary_succeeded.contains(&req.action) {
            continue;
        }

        if let Some(claimer) = claimed.get(&req.accel) {
            if claimer != &req.action {
                outcomes.push(ShortcutOutcome {
                    action: req.action.clone(),
                    accel: req.accel.clone(),
                    succeeded: false,
                    fallback: req.fallback,
                    error: Some(format!("already claimed by {claimer}")),
                });
                continue;
            }
        }

        let shortcut: Shortcut = match req.accel.parse() {
            Ok(s) => s,
            Err(e) => {
                outcomes.push(ShortcutOutcome {
                    action: req.action,
                    accel: req.accel,
                    succeeded: false,
                    fallback: req.fallback,
                    error: Some(format!("parse: {e}")),
                });
                continue;
            }
        };

        match gs.register(shortcut) {
            Ok(()) => {
                info!("registered {} → {} (id={})", req.accel, req.action, shortcut.id());
                new_active.insert(shortcut.id(), req.action.clone());
                claimed.insert(req.accel.clone(), req.action.clone());
                if !req.fallback {
                    primary_succeeded.insert(req.action.clone());
                }
                outcomes.push(ShortcutOutcome {
                    action: req.action,
                    accel: req.accel,
                    succeeded: true,
                    fallback: req.fallback,
                    error: None,
                });
            }
            Err(e) => {
                warn!("register failed {} → {}: {e}", req.accel, req.action);
                outcomes.push(ShortcutOutcome {
                    action: req.action,
                    accel: req.accel,
                    succeeded: false,
                    fallback: req.fallback,
                    error: Some(e.to_string()),
                });
            }
        }
    }

    let ok_count = outcomes.iter().filter(|o| o.succeeded).count();
    info!(
        "set_shortcuts done: {}/{} succeeded",
        ok_count,
        outcomes.len()
    );
    *registry.active.lock().map_err(|e| e.to_string())? = new_active;
    Ok(outcomes)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Install the log subscriber first so everything downstream — plugin
        // setups, our own manage/invoke_handler, the shortcut event handler —
        // lands in the same file (+ stdout in dev).
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if !matches!(event.state, ShortcutState::Pressed) {
                        return;
                    }
                    let registry: State<ShortcutRegistry> = app.state();
                    let action = match registry.active.lock() {
                        Ok(active) => active.get(&shortcut.id()).cloned(),
                        Err(_) => None,
                    };
                    match action {
                        Some(action) => {
                            info!("shortcut fired: id={} → {}", shortcut.id(), action);
                            if let Err(err) = app.emit("shortcut:fired", &action) {
                                error!("emit shortcut:fired failed: {err}");
                            }
                        }
                        None => warn!(
                            "shortcut fired but no mapping: id={}",
                            shortcut.id()
                        ),
                    }
                })
                .build(),
        )
        .manage(ShortcutRegistry::default())
        .invoke_handler(tauri::generate_handler![
            toggle_stack,
            show_stack,
            hide_stack,
            set_shortcuts
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
