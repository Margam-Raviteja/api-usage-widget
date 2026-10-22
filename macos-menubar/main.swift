import AppKit
import Foundation
import QuartzCore

class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    var statusItem: NSStatusItem!
    var refreshTimer: Timer?
    var tickerTimer: Timer?
    var isMenuOpen = false
    let scriptPath: String

    var tickerItems: [String] = []
    var currentTickerIndex: Int = 0

    override init() {
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
            button.wantsLayer = true
            button.title = "⚡️ API Monitor"
        }

        refreshData()

        // Background data refresh every 15 minutes
        refreshTimer = Timer.scheduledTimer(withTimeInterval: 900, repeats: true) { [weak self] _ in
            self?.refreshData()
        }

        // Vertical scroll ticker every 3 seconds
        tickerTimer = Timer.scheduledTimer(withTimeInterval: 3.0, repeats: true) { [weak self] _ in
            self?.scrollNextTickerItem()
        }
    }

    @objc func refreshData() {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            let output = self.runScript()
            DispatchQueue.main.async {
                self.updateState(with: output)
            }
        }
    }

    func runScript() -> String {
        let process = Process()
        let pipe = Pipe()

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

    func updateState(with rawOutput: String) {
        let lines = rawOutput.components(separatedBy: .newlines).filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
        guard !lines.isEmpty else { return }

        // Find divider separating ticker headers from dropdown menu
        var newTickerItems: [String] = []
        var dropdownStartIndex = 0

        for (index, line) in lines.enumerated() {
            if line.hasPrefix("---") {
                dropdownStartIndex = index + 1
                break
            }
            let parts = line.components(separatedBy: "|")
            let title = parts[0].trimmingCharacters(in: .whitespaces)
            if !title.isEmpty {
                newTickerItems.append(title)
            }
        }

        if !newTickerItems.isEmpty {
            self.tickerItems = newTickerItems
            if self.currentTickerIndex >= self.tickerItems.count {
                self.currentTickerIndex = 0
            }
            // Set initial title without animation
            if let button = statusItem.button, !isMenuOpen {
                button.title = self.tickerItems[self.currentTickerIndex]
            }
        }

        // Build Dropdown Menu
        let menu = NSMenu()
        menu.delegate = self
        menu.autoenablesItems = false

        let dropdownLines = lines.dropFirst(dropdownStartIndex)
        for line in dropdownLines {
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

    func scrollNextTickerItem() {
        guard !tickerItems.isEmpty, !isMenuOpen else { return }
        guard let button = statusItem.button else { return }

        currentTickerIndex = (currentTickerIndex + 1) % tickerItems.count
        let nextTitle = tickerItems[currentTickerIndex]

        // Native vertical push scroll animation from bottom to top
        button.wantsLayer = true
        let transition = CATransition()
        transition.duration = 0.32
        transition.type = .push
        transition.subtype = .fromBottom
        transition.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)

        button.layer?.add(transition, forKey: "verticalPushScroll")
        button.title = nextTitle
    }

    // MARK: - NSMenuDelegate (Pause animation while menu is open)
    func menuWillOpen(_ menu: NSMenu) {
        isMenuOpen = true
    }

    func menuDidClose(_ menu: NSMenu) {
        isMenuOpen = false
    }

    // MARK: - Actions
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
