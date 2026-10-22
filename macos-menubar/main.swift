import AppKit
import Foundation

class AppDelegate: NSObject, NSApplicationDelegate {
    var statusItem: NSStatusItem!
    var timer: Timer?
    let scriptPath: String

    override init() {
        // Resolve script path relative to this binary or standard location
        let bundleDir = Bundle.main.bundlePath
        let defaultPath = "/Users/raviteja/Developer/api-usage-widget/swiftbar/api-usage.15m.js"
        if FileManager.default.fileExists(atPath: defaultPath) {
            self.scriptPath = defaultPath
        } else {
            self.scriptPath = "\(bundleDir)/../swiftbar/api-usage.15m.js"
        }
        super.init()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = statusItem.button {
            button.title = "⚡️ API Monitor"
        }

        refreshData()

        // Auto-refresh every 15 minutes
        timer = Timer.scheduledTimer(withTimeInterval: 900, repeats: true) { [weak self] _ in
            self?.refreshData()
        }
    }

    @objc func refreshData() {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            let output = self.runScript()
            DispatchQueue.main.async {
                self.updateMenu(with: output)
            }
        }
    }

    func runScript() -> String {
        let process = Process()
        let pipe = Pipe()

        // Check node binary
        let nodePath = FileManager.default.fileExists(atPath: "/opt/homebrew/bin/node") 
            ? "/opt/homebrew/bin/node" 
            : "/usr/local/bin/node"

        process.executableURL = URL(fileURLWithPath: nodePath)
        process.arguments = [scriptPath]
        process.standardOutput = pipe
        process.standardError = pipe

        do {
            try process.run()
            process.waitUntilExit()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            return String(data: data, encoding: .utf8) ?? ""
        } catch {
            return "⚡️ API: Error | dropdown=false\n---\nFailed to run script: \(error.localizedDescription)"
        }
    }

    func updateMenu(with rawOutput: String) {
        let lines = rawOutput.components(separatedBy: .newlines).filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
        guard let first = lines.first else { return }

        // First line is menu bar status text
        let titleParts = first.components(separatedBy: "|")
        let title = titleParts[0].trimmingCharacters(in: .whitespaces)
        if let button = statusItem.button {
            button.title = title
        }

        let menu = NSMenu()
        menu.autoenablesItems = false

        for line in lines.dropFirst() {
            if line.hasPrefix("---") {
                menu.addItem(NSMenuItem.separator())
                continue
            }

            let parts = line.components(separatedBy: "|")
            let text = parts[0].trimmingCharacters(in: .whitespaces)
            var targetURL: String? = nil
            var isRefresh = false
            var openFilePath: String? = nil

            for part in parts.dropFirst() {
                let trimmed = part.trimmingCharacters(in: .whitespaces)
                if trimmed.hasPrefix("href=") {
                    targetURL = String(trimmed.dropFirst(5))
                } else if trimmed.hasPrefix("refresh=true") {
                    isRefresh = true
                } else if trimmed.hasPrefix("bash=open param1=") {
                    openFilePath = String(trimmed.dropFirst(17)).components(separatedBy: " ")[0]
                }
            }

            let item = NSMenuItem(title: text, action: nil, keyEquivalent: "")

            if isRefresh {
                item.target = self
                item.action = #selector(refreshData)
                item.isEnabled = true
            } else if let filePath = openFilePath {
                item.representedObject = filePath
                item.target = self
                item.action = #selector(openFileAction(_:))
                item.isEnabled = true
            } else if let urlStr = targetURL, let url = URL(string: urlStr) {
                item.representedObject = url
                item.target = self
                item.action = #selector(openURLAction(_:))
                item.isEnabled = true
            } else {
                item.isEnabled = false
            }

            menu.addItem(item)
        }

        // Add Quit button
        menu.addItem(NSMenuItem.separator())
        let quitItem = NSMenuItem(title: "Quit API Monitor", action: #selector(quitApp), keyEquivalent: "q")
        quitItem.target = self
        quitItem.isEnabled = true
        menu.addItem(quitItem)

        statusItem.menu = menu
    }

    @objc func openURLAction(_ sender: NSMenuItem) {
        if let url = sender.representedObject as? URL {
            NSWorkspace.shared.open(url)
        }
    }

    @objc func openFileAction(_ sender: NSMenuItem) {
        if let path = sender.representedObject as? String {
            NSWorkspace.shared.open(URL(fileURLWithPath: path))
        }
    }

    @objc func quitApp() {
        NSApplication.shared.terminate(nil)
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory) // Hides from Dock, lives only in Menu Bar!
app.run()
