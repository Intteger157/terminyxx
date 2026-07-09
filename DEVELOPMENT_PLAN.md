# Terminyxx — Development Plan

Кроссплатформенный эмулятор терминала и клиент удалённого управления (Windows + macOS).

**Стек:** Go + Wails v2 · React + TypeScript + Tailwind CSS · xterm.js · golang.org/x/crypto/ssh · github.com/pkg/sftp

---

## Фаза 1 — Инициализация и UI-оболочка

**Цель:** рабочий каркас приложения с современным тёмным интерфейсом.

### Задачи
- [x] `wails init` с шаблоном `react-ts`
- [x] Tailwind CSS + PostCSS + autoprefixer
- [x] Lucide React для иконок
- [x] Базовый layout: sidebar (список хостов), tab bar, toolbar, main area
- [x] Тёмная тема по умолчанию

### Критерий готовности
`wails dev` запускается, отображается пустой shell с вкладками и sidebar.

---

## Фаза 2 — SSH-движок + xterm.js

**Цель:** интерактивный SSH-терминал с поддержкой вкладок.

### Задачи
- [x] Go: `ConnectionManager.Connect()` → `ssh.Dial` + PTY session (`RequestPty`, `Shell`)
- [x] Поток данных: Go `EventsEmit("terminal:output:{id}")` → React `EventsOn` → `xterm.write()`
- [x] Ввод/resize: Wails bindings `WriteInput(id, data)`, `ResizePTY(id, cols, rows)`
- [x] React: компонент `TerminalTab` с `@xterm/xterm` + `@xterm/addon-fit`
- [x] Множественные вкладки — каждая вкладка = отдельный `ManagedConnection`

### Критерий готовности
Интерактивный shell в одной вкладке, resize при изменении окна, несколько вкладок работают независимо.

---

## Фаза 3 — Мультиплексированный SFTP

**Цель:** двухпанельный файловый менеджер поверх активной SSH-сессии без нового TCP-соединения.

### Задачи
- [x] Go: `EnsureSFTP(connID)` → `sftp.NewClient(existingSSHClient)`
- [x] Bindings: `ListDir`, `Stat`, `Mkdir`, `Remove`, `Rename`, `Download`, `Upload` (с progress events)
- [x] React: `SftpPanel` — локальная FS слева / удалённая справа
- [x] Горячие клавиши Total Commander:
  - **F3** — просмотр файла
  - **F5** — копирование
  - **F6** — перемещение
  - **F7** — создать каталог
  - **F8** — удаление
  - **Tab** — переключение активной панели
- [x] Toggle SFTP: `Ctrl+Shift+F` или кнопка в toolbar

### Критерий готовности
SFTP открывается поверх активной SSH-сессии, файлы копируются без reconnect.

---

## Фаза 4 — RDP

**Цель:** хранение профилей и запуск нативных RDP-клиентов.

### Задачи
- [x] Модель `RDPProfile` (host, port, username, domain, resolution, fullscreen)
- [x] Windows: генерация `.rdp` файла + `mstsc.exe`
- [x] macOS: `open` с URL-схемой / Microsoft Remote Desktop
- [x] UI: список RDP-профилей в sidebar, кнопка «Подключить»

### Критерий готовности
Профиль сохраняется и запускает нативный клиент на обеих ОС.

---

## Фаза 5 — Менеджер сессий и безопасность

**Цель:** персистентное хранение профилей с зашифрованными credentials.

### Задачи
- [x] SQLite через `modernc.org/sqlite` (чистый Go, без CGO)
- [x] Таблицы: `hosts`, `ssh_profiles`, `rdp_profiles`, `credentials`
- [ ] Шифрование: OS keychain (macOS Keychain / Windows DPAPI) — **TODO**
- [x] Импорт/экспорт профилей (базовый CRUD)

### Критерий готовности
Профили переживают перезапуск приложения. Credentials пока в plaintext с пометкой TODO.

---

## Архитектура бэкенда

```
React (UI state)  ←→  Wails Bindings (команды)  ←→  ConnectionManager
React (xterm)     ←   Wails Events (поток)       ←   PTY goroutines
```

### ConnectionManager
Централизованный менеджер всех SSH-соединений. Один `*ssh.Client` мультиплексирует:
- **PTY session** — интерактивный терминал
- **SFTP client** — файловый менеджер (тот же TCP)

### Структура каталогов
```
internal/
├── connection/   # Manager, ManagedConnection, PTY, SFTP
├── rdp/          # Platform-specific RDP launchers
└── store/        # SQLite persistence
frontend/src/
├── components/
│   ├── layout/   # Sidebar, TabBar, Toolbar
│   ├── terminal/ # XTermWrapper, TerminalTabs
│   └── sftp/     # DualPane, SftpPanel
└── hooks/        # useWailsEvents, useHotkeys
```

---

## Зависимости

### Go
```
github.com/wailsapp/wails/v2
golang.org/x/crypto/ssh
github.com/pkg/sftp
github.com/google/uuid
modernc.org/sqlite
```

### Frontend
```
tailwindcss, lucide-react
@xterm/xterm, @xterm/addon-fit, @xterm/addon-web-links
```
