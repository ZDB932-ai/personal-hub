mod pet;
mod todo;

use tauri::{
  menu::{Menu, MenuItem},
  tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
  Emitter, Manager, WindowEvent,
};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

fn window_state_flags() -> StateFlags {
  StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED
}

fn show_main_window(app: &tauri::AppHandle) {
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
    pet::refresh(app);
  }
}

pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_single_instance::init(|app, _, _| show_main_window(app)))
    .plugin(tauri_plugin_window_state::Builder::default()
      .with_state_flags(window_state_flags())
      .with_filter(|label| label == "main")
      .build())
    .manage(pet::PetState::default())
    .manage(todo::TodoState::default())
    .invoke_handler(tauri::generate_handler![pet::pet_preferences, pet::pet_configure, pet::pet_home, pet::pet_reset_position,
      todo::todo_connect, todo::todo_publish, todo::todo_read, todo::todo_configure, todo::todo_reset_position,
      todo::todo_submit, todo::todo_work, todo::todo_resolve, todo::todo_home, todo::todo_activity,
      todo::todo_heartbeat, todo::todo_disconnect, todo::todo_finish_quit, todo::todo_cancel_quit,
      todo::todo_window_bounds, todo::todo_set_window_bounds])
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .setup(|app| {
      pet::setup(app.handle())?;
      todo::setup(app.handle())?;
      let open = MenuItem::with_id(app, "open", "打开 Personal Hub", true, None::<&str>)?;
      let lock = MenuItem::with_id(app, "lock", "锁定应用", true, None::<&str>)?;
      let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
      let show_todo = MenuItem::with_id(app, "todo-show", "显示桌面 Todo", true, None::<&str>)?;
      let hide_todo = MenuItem::with_id(app, "todo-hide", "关闭桌面 Todo", true, None::<&str>)?;
      let reset_todo = MenuItem::with_id(app, "todo-reset", "找回 Todo 位置", true, None::<&str>)?;
      let menu = Menu::with_items(app, &[&open, &show_todo, &hide_todo, &reset_todo, &lock, &quit])?;
      TrayIconBuilder::with_id("personal-hub-tray")
        .tooltip("Personal Hub")
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
          "open" => show_main_window(app),
          "lock" => {
            if let Some(window) = app.get_webview_window("main") {
              let _ = window.emit("desktop://lock", ());
            }
          }
          "todo-show" => { if let Err(error) = todo::set_enabled(app, true) { log::warn!("显示 Todo 失败: {error}"); } },
          "todo-hide" => { if let Err(error) = todo::set_enabled(app, false) { log::warn!("关闭 Todo 失败: {error}"); } },
          "todo-reset" => { if let Err(error) = todo::reset_position(app) { log::warn!("找回 Todo 失败: {error}"); } },
          "quit" => todo::request_quit(app),
          _ => {}
        })
        .on_tray_icon_event(|tray, event| {
          if let TrayIconEvent::Click {
            button: MouseButton::Left,
            button_state: MouseButtonState::Up,
            ..
          } = event
          {
            show_main_window(tray.app_handle());
          }
        })
        .build(app)?;
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .on_window_event(|window, event| {
      todo::window_event(window, event);
      if window.label() != "main" { return; }
      if matches!(event, WindowEvent::Resized(_) | WindowEvent::Focused(_)) {
        pet::refresh(window.app_handle());
      }
      if let WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();
        if let Err(error) = window.app_handle().save_window_state(window_state_flags()) {
          log::warn!("无法保存主窗口布局: {error}");
        }
        let _ = window.hide();
        pet::refresh(window.app_handle());
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
