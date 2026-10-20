import AppKit
import ApplicationServices

func emit(_ value: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: value),
       let line = String(data: data, encoding: .utf8) {
        print(line)
        fflush(stdout)
    }
}
func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else { return nil }
    return value
}
func sample() {
    guard AXIsProcessTrusted() else { emit(["mode": "permission"]); return }
    guard let target = NSWorkspace.shared.runningApplications.first(where: { $0.bundleIdentifier == "com.openai.codex" }), !target.isHidden else {
        emit(["mode": "hidden"]); return
    }
    let app = AXUIElementCreateApplication(target.processIdentifier)
    guard let windows = attribute(app, kAXWindowsAttribute) as? [AXUIElement],
          let window = windows.first(where: { (attribute($0, kAXMinimizedAttribute) as? Bool) != true }),
          let rawPosition = attribute(window, kAXPositionAttribute),
          let rawSize = attribute(window, kAXSizeAttribute),
          CFGetTypeID(rawPosition) == AXValueGetTypeID(), CFGetTypeID(rawSize) == AXValueGetTypeID() else {
        emit(["mode": "hidden"]); return
    }
    var position = CGPoint.zero
    var size = CGSize.zero
    guard AXValueGetValue(rawPosition as! AXValue, .cgPoint, &position),
          AXValueGetValue(rawSize as! AXValue, .cgSize, &size) else { emit(["mode": "hidden"]); return }
    emit(["mode": "attached", "bounds": ["x": position.x, "y": position.y, "width": size.width, "height": size.height]])
}
sample()
Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { _ in sample() }
RunLoop.main.run()
