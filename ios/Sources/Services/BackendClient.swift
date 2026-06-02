import Foundation

/// Uploads the Google Takeout .zip to the Cloudflare Worker and decodes the
/// normalized payload. The zip is sent as the raw request body (the Worker
/// reads `request.arrayBuffer()` directly).
struct BackendClient {
    /// Base URL of the deployed Worker, e.g.
    /// https://takeout-fit-to-health.<account>.workers.dev
    let baseURL: URL

    enum ClientError: LocalizedError {
        case server(status: Int, message: String)
        case decoding(Error)

        var errorDescription: String? {
            switch self {
            case let .server(status, message): return "Server error \(status): \(message)"
            case let .decoding(error): return "Could not read server response: \(error.localizedDescription)"
            }
        }
    }

    private static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        decoder.dateDecodingStrategy = .custom { decoder in
            let string = try decoder.singleValueContainer().decode(String.self)
            guard let date = formatter.date(from: string) else {
                throw DecodingError.dataCorrupted(.init(
                    codingPath: decoder.codingPath,
                    debugDescription: "Invalid ISO-8601 date: \(string)"
                ))
            }
            return date
        }
        return decoder
    }()

    /// Sends `zipData` to /api/convert and returns the parsed payload.
    func convert(zipData: Data) async throws -> NormalizedPayload {
        var request = URLRequest(url: baseURL.appendingPathComponent("api/convert"))
        request.httpMethod = "POST"
        request.setValue("application/zip", forHTTPHeaderField: "Content-Type")

        let (data, response) = try await URLSession.shared.upload(for: request, from: zipData)
        guard let http = response as? HTTPURLResponse else {
            throw ClientError.server(status: -1, message: "no HTTP response")
        }
        guard (200..<300).contains(http.statusCode) else {
            let message = String(data: data, encoding: .utf8) ?? "<unreadable>"
            throw ClientError.server(status: http.statusCode, message: message)
        }
        do {
            return try Self.decoder.decode(NormalizedPayload.self, from: data)
        } catch {
            throw ClientError.decoding(error)
        }
    }
}
