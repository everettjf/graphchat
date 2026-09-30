import Foundation

/// The Bun program the app wraps: started at launch, restarted on crash,
/// terminated on quit. Output goes to `~/Library/Logs/<App>/server.log`.
final class ServerProcess {
    enum State: Equatable {
        case starting
        case running
        case stopped(String)
    }

    var onStateChange: ((State) -> Void)?
    private(set) var state: State = .stopped("Not started") {
        didSet { if state != oldValue { onStateChange?(state) } }
    }

    private let manifest: Manifest
    private let locations: Locations
    private var process: Process?
    private var logHandle: FileHandle?
    private var healthTimer: Timer?
    private var crashCount = 0
    private var stopping = false

    init(manifest: Manifest, locations: Locations) {
        self.manifest = manifest
        self.locations = locations
    }

    var logFile: URL { locations.logs.appendingPathComponent("server.log") }

    func start() {
        stopping = false
        let process = Process()
        let command = locations.expand(manifest.server.command)
        process.executableURL = URL(fileURLWithPath: command.hasPrefix("/") ? command : locations.resources.appendingPathComponent(command).path)
        process.arguments = (manifest.server.args ?? []).map(locations.expand)
        process.currentDirectoryURL = URL(fileURLWithPath: locations.expand(manifest.server.cwd ?? "${APP_SUPPORT}"))

        var env = ProcessInfo.processInfo.environment
        env["MENUBAR_RESOURCES"] = locations.resources.path
        env["MENUBAR_APP_SUPPORT"] = locations.appSupport.path
        env["MENUBAR_LOGS"] = locations.logs.path
        for (key, value) in manifest.server.env ?? [:] {
            env[key] = locations.expand(value)
        }
        process.environment = env

        FileManager.default.createFile(atPath: logFile.path, contents: nil)
        if let handle = try? FileHandle(forWritingTo: logFile) {
            handle.seekToEndOfFile()
            logHandle = handle
            process.standardOutput = handle
            process.standardError = handle
        }

        process.terminationHandler = { [weak self] finished in
            DispatchQueue.main.async { self?.handleExit(finished) }
        }

        do {
            try process.run()
            self.process = process
            state = .starting
            scheduleHealthChecks()
        } catch {
            state = .stopped("Could not start: \(error.localizedDescription)")
        }
    }

    func restart() {
        crashCount = 0
        stop { [weak self] in self?.start() }
    }

    func stop(completion: (() -> Void)? = nil) {
        stopping = true
        healthTimer?.invalidate()
        guard let process, process.isRunning else {
            state = .stopped("Stopped")
            completion?()
            return
        }
        process.terminate() // SIGTERM
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
            if process.isRunning { kill(process.processIdentifier, SIGKILL) }
            self?.process = nil
            self?.state = .stopped("Stopped")
            completion?()
        }
    }

    private func handleExit(_ finished: Process) {
        healthTimer?.invalidate()
        logHandle?.closeFile()
        logHandle = nil
        process = nil
        if stopping { return }
        crashCount += 1
        let limit = manifest.restartLimit ?? 5
        if crashCount > limit {
            state = .stopped("Exited with code \(finished.terminationStatus); gave up after \(limit) restarts")
            return
        }
        state = .stopped("Exited with code \(finished.terminationStatus); restarting…")
        let delay = min(30.0, pow(2.0, Double(crashCount - 1)))
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            guard let self, !self.stopping else { return }
            self.start()
        }
    }

    private func scheduleHealthChecks() {
        healthTimer?.invalidate()
        guard let health = manifest.healthUrl, let url = URL(string: health) else {
            state = .running
            return
        }
        let timer = Timer(timeInterval: 1.0, repeats: true) { [weak self] _ in self?.checkHealth(url) }
        RunLoop.main.add(timer, forMode: .common)
        healthTimer = timer
        checkHealth(url)
    }

    private func checkHealth(_ url: URL) {
        var request = URLRequest(url: url)
        request.timeoutInterval = 2
        request.cachePolicy = .reloadIgnoringLocalCacheData
        URLSession.shared.dataTask(with: request) { [weak self] _, response, _ in
            let ok = (response as? HTTPURLResponse).map { (200..<300).contains($0.statusCode) } ?? false
            DispatchQueue.main.async {
                guard let self, self.process?.isRunning == true else { return }
                if ok {
                    self.crashCount = 0
                    self.state = .running
                    // Healthy: back off to a slower heartbeat.
                    self.healthTimer?.invalidate()
                    let timer = Timer(timeInterval: 5.0, repeats: true) { [weak self] _ in self?.checkHealth(url) }
                    RunLoop.main.add(timer, forMode: .common)
                    self.healthTimer = timer
                } else if self.state == .running {
                    self.state = .starting
                }
            }
        }.resume()
    }
}
