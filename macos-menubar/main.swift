import AppKit
import Foundation
import QuartzCore

struct TickerItem {
    let title: String
    let iconName: String?
    let image: NSImage?
}

class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    var statusItem: NSStatusItem!
    var refreshTimer: Timer?
    var tickerTimer: Timer?
    var isMenuOpen = false
    let scriptPath: String

    var tickerItems: [TickerItem] = []
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
            button.imagePosition = .imageLeft
            button.title = "API Monitor"
        }

        refreshData()

        // Background data refresh every 15 minutes
        refreshTimer = Timer.scheduledTimer(withTimeInterval: 900, repeats: true) { [weak self] _ in
            self?.refreshData()
        }

        // Vertical scroll ticker every 5 seconds (Endless loop on .common mode)
        let timer = Timer(timeInterval: 5.0, repeats: true) { [weak self] _ in
            self?.scrollNextTickerItem()
        }
        RunLoop.main.add(timer, forMode: .common)
        self.tickerTimer = timer
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
            return "API Monitor: Error | dropdown=false\n---\nFailed to run script: \(error.localizedDescription)"
        }
    }

    func loadIcon(named iconName: String?, base64: String? = nil) -> NSImage? {
        var img: NSImage? = nil
        if let b64 = base64, !b64.isEmpty, let data = Data(base64Encoded: b64) {
            img = NSImage(data: data)
        }
        let name = iconName?.lowercased() ?? ""
        if img == nil && !name.isEmpty {
            let bundle = Bundle.main.bundlePath
            let candidates = [
                "\(bundle)/Contents/Resources/icons/\(name).png",
                "/Users/raviteja/Developer/api-usage-widget/assets/icons/\(name).png",
                "/Users/raviteja/Developer/api-usage-widget/assets/icons/original/\(name).png"
            ]
            for path in candidates {
                if FileManager.default.fileExists(atPath: path), let loadedFromFile = NSImage(contentsOfFile: path) {
                    img = loadedFromFile
                    break
                }
            }
        }
        guard let loaded = img else { return nil }

        // Preserve aspect ratio with height of 16 points (Retina crispness)
        let originalSize = loaded.size
        if originalSize.height > 0 {
            let targetHeight: CGFloat = 16.0
            let targetWidth = targetHeight * (originalSize.width / originalSize.height)
            loaded.size = NSSize(width: max(8, min(28, targetWidth)), height: targetHeight)
        } else {
            loaded.size = NSSize(width: 16, height: 16)
        }

        // grok, groq, openrouter, and openai are monochrome; set template so they adapt to dark/light menu bar
        if name == "grok" || name == "groq" || name == "openrouter" || name == "openai" {
            loaded.isTemplate = true
        } else {
            loaded.isTemplate = false // Keep DeepSeek blue, Google Cloud multi-color, Anthropic terracotta
        }

        return loaded
    }

    func parseLine(_ line: String) -> (title: String, params: [String: String]) {
        let parts = line.components(separatedBy: "|")
        let title = parts.first?.trimmingCharacters(in: .whitespaces) ?? ""
        var params: [String: String] = [:]

        for part in parts.dropFirst() {
            let trimmed = part.trimmingCharacters(in: .whitespaces)
            let tokens = trimmed.components(separatedBy: .whitespaces).filter { !$0.isEmpty }
            for token in tokens {
                if let eq = token.firstIndex(of: "=") {
                    let k = String(token[..<eq]).lowercased()
                    let v = String(token[token.index(after: eq)...])
                    params[k] = v
                }
            }
        }
        return (title, params)
    }

    func updateState(with rawOutput: String) {
        let lines = rawOutput.components(separatedBy: .newlines).filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
        guard !lines.isEmpty else { return }

        // Find divider separating ticker headers from dropdown menu
        var newTickerItems: [TickerItem] = []
        var dropdownStartIndex = 0

        for (index, line) in lines.enumerated() {
            if line.hasPrefix("---") {
                dropdownStartIndex = index + 1
                break
            }
            let (title, params) = parseLine(line)
            let iconName = params["icon"]
            let base64Str = params["image"]

            if !title.isEmpty {
                let img = loadIcon(named: iconName, base64: base64Str)
                newTickerItems.append(TickerItem(title: title, iconName: iconName, image: img))
            }
        }

        if !newTickerItems.isEmpty {
            self.tickerItems = newTickerItems
            if self.currentTickerIndex >= self.tickerItems.count {
                self.currentTickerIndex = 0
            }
            // Set initial state without animation
            if let button = statusItem.button, !isMenuOpen {
                let initial = self.tickerItems[self.currentTickerIndex]
                button.image = initial.image
                button.imagePosition = .imageLeft
                button.title = " " + initial.title
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

            let (title, params) = parseLine(line)
            let targetURL = params["href"]
            let isRefresh = params["refresh"] == "true"
            let openFilePath = params["bash"] == "open" ? params["param1"] : nil
            let iconName = params["icon"]
            let base64Str = params["image"]

            let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
            if let itemIcon = loadIcon(named: iconName, base64: base64Str) {
                item.image = itemIcon
            }

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
        let nextItem = tickerItems[currentTickerIndex]

        // Native vertical push scroll animation from bottom to top (slow & smooth)
        button.wantsLayer = true
        let transition = CATransition()
        transition.duration = 0.58
        transition.type = .push
        transition.subtype = .fromBottom
        transition.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)

        button.layer?.add(transition, forKey: "verticalPushScroll")
        button.image = nextItem.image
        button.imagePosition = .imageLeft
        button.title = " " + nextItem.title
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
