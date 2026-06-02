import SwiftUI

@main
struct TakeoutFitToHealthApp: App {
    /// The deployed Cloudflare Worker base URL. Override at build time via the
    /// BACKEND_URL Info.plist value (see project.yml) so you don't hard-code an
    /// account-specific hostname into source.
    private var backendURL: URL {
        if let string = Bundle.main.object(forInfoDictionaryKey: "BACKEND_URL") as? String,
           let url = URL(string: string), !string.isEmpty {
            return url
        }
        // Local development default (`wrangler dev`).
        return URL(string: "http://127.0.0.1:8787")!
    }

    var body: some Scene {
        WindowGroup {
            ContentView(backendURL: backendURL)
        }
    }
}
