import AppKit

/// Menu bar shell for a Bun program. Reads `menubar.json` from the bundle's
/// Resources, runs the program, and exposes it through a status item.
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem!
    private var manifest: Manifest!
    private var locations: Locations!
    private var server: ServerProcess!
    private var statusMenuItem: NSMenuItem!
    private var openMenuItems: [NSMenuItem] = []

    func applicationDidFinishLaunching(_ notification: Notification) {
        do {
            let resources = Bundle.main.resourceURL ?? Bundle.main.bundleURL.appendingPathComponent("Contents/Resources")
            manifest = try ManifestLoader.load(from: resources)
            locations = try Locations(bundle: Bundle.main, appName: manifest.name)
        } catch {
            let alert = NSAlert()
            alert.messageText = "This app is missing its menubar.json manifest."
            alert.informativeText = error.localizedDescription
            alert.runModal()
            NSApp.terminate(nil)
            return
        }

        enforceSingleInstance()
        buildStatusItem()

        server = ServerProcess(manifest: manifest, locations: locations)
        server.onStateChange = { [weak self] state in self?.render(state) }
        server.start()

        if manifest.openOnLaunch ?? false {
            waitForHealthThenOpen()
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        server?.stop()
    }

    // MARK: Status item

    private func buildStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = statusItem.button {
            if let iconName = manifest.icon,
               let image = NSImage(contentsOf: locations.resources.appendingPathComponent(iconName)) {
                image.isTemplate = true
                image.size = NSSize(width: 18, height: 18)
                button.image = image
            } else {
                button.title = String(manifest.name.prefix(1))
            }
            button.toolTip = manifest.name
        }

        let menu = NSMenu()
        statusMenuItem = NSMenuItem(title: "Starting…", action: nil, keyEquivalent: "")
        statusMenuItem.isEnabled = false
        menu.addItem(statusMenuItem)
        menu.addItem(.separator())

        for item in manifest.menu ?? defaultMenu() {
            if item.type == "separator" {
                menu.addItem(.separator())
                continue
            }
            let menuItem = NSMenuItem(title: item.label ?? "", action: #selector(handleMenu(_:)), keyEquivalent: "")
            menuItem.target = self
            menuItem.representedObject = item.url ?? item.action ?? ""
            if item.action == "open" || item.url != nil { openMenuItems.append(menuItem) }
            menu.addItem(menuItem)
        }
        menu.addItem(.separator())
        let logs = NSMenuItem(title: "Show Logs", action: #selector(showLogs), keyEquivalent: "")
        logs.target = self
        menu.addItem(logs)
        let restart = NSMenuItem(title: "Restart Server", action: #selector(restartServer), keyEquivalent: "")
        restart.target = self
        menu.addItem(restart)
        menu.addItem(.separator())
        let quit = NSMenuItem(title: "Quit \(manifest.name)", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        menu.addItem(quit)
        statusItem.menu = menu
    }

    private func defaultMenu() -> [Manifest.MenuItem] {
        [Manifest.MenuItem(type: nil, label: "Open \(manifest.name)", action: "open", url: nil)]
    }

    private func render(_ state: ServerProcess.State) {
        switch state {
        case .starting:
            statusMenuItem.title = "Starting…"
        case .running:
            statusMenuItem.title = "Running"
        case .stopped(let reason):
            statusMenuItem.title = reason
        }
        let healthy = state == .running
        for item in openMenuItems { item.isEnabled = healthy }
        statusItem.button?.appearsDisabled = !healthy
    }

    // MARK: Actions

    @objc private func handleMenu(_ sender: NSMenuItem) {
        guard let target = sender.representedObject as? String else { return }
        switch target {
        case "open":
            openMain()
        case "restart":
            restartServer()
        case "quit":
            NSApp.terminate(nil)
        default:
            if let url = URL(string: target) { NSWorkspace.shared.open(url) }
        }
    }

    @objc private func restartServer() {
        server.restart()
    }

    @objc private func showLogs() {
        NSWorkspace.shared.activateFileViewerSelecting([server.logFile])
    }

    private func openMain() {
        guard let open = manifest.openUrl, let url = URL(string: open) else { return }
        NSWorkspace.shared.open(url)
    }

    private func waitForHealthThenOpen() {
        var attempts = 0
        func poll() {
            attempts += 1
            if server.state == .running {
                openMain()
            } else if attempts < 60 {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5, execute: poll)
            }
        }
        poll()
    }

    private func enforceSingleInstance() {
        guard let bundleId = Bundle.main.bundleIdentifier else { return }
        let others = NSRunningApplication.runningApplications(withBundleIdentifier: bundleId)
            .filter { $0.processIdentifier != ProcessInfo.processInfo.processIdentifier }
        if !others.isEmpty {
            NSApp.terminate(nil)
        }
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
