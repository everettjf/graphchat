import Foundation

/// `Contents/Resources/menubar.json`, written by `bun-menubar build`.
struct Manifest: Decodable {
    struct Server: Decodable {
        var command: String
        var args: [String]?
        var env: [String: String]?
        var cwd: String?
    }

    struct MenuItem: Decodable {
        var type: String?
        var label: String?
        var action: String?
        var url: String?
    }

    var name: String
    var server: Server
    var healthUrl: String?
    var openUrl: String?
    var openOnLaunch: Bool?
    var icon: String?
    var menu: [MenuItem]?
    var restartLimit: Int?
}

enum ManifestLoader {
    static func load(from resources: URL) throws -> Manifest {
        let data = try Data(contentsOf: resources.appendingPathComponent("menubar.json"))
        return try JSONDecoder().decode(Manifest.self, from: data)
    }
}

/// Paths the shell hands to the server process and substitutes into the manifest.
struct Locations {
    let resources: URL
    let appSupport: URL
    let logs: URL

    init(bundle: Bundle, appName: String) throws {
        resources = bundle.resourceURL ?? bundle.bundleURL.appendingPathComponent("Contents/Resources")
        let library = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0]
        appSupport = library.appendingPathComponent("Application Support").appendingPathComponent(appName)
        logs = library.appendingPathComponent("Logs").appendingPathComponent(appName)
        for directory in [appSupport, logs] {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        }
    }

    /// Expand `${RESOURCES}`, `${APP_SUPPORT}`, `${LOGS}`, and `${HOME}`.
    func expand(_ value: String) -> String {
        value
            .replacingOccurrences(of: "${RESOURCES}", with: resources.path)
            .replacingOccurrences(of: "${APP_SUPPORT}", with: appSupport.path)
            .replacingOccurrences(of: "${LOGS}", with: logs.path)
            .replacingOccurrences(of: "${HOME}", with: NSHomeDirectory())
    }
}
