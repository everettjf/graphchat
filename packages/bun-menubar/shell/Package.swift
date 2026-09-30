// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "MenuBarShell",
    platforms: [.macOS(.v12)],
    targets: [
        .executableTarget(
            name: "MenuBarShell",
            path: "Sources/MenuBarShell",
            swiftSettings: [.unsafeFlags(["-Osize"])]
        ),
    ]
)
