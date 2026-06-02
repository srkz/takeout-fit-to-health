import SwiftUI
import UniformTypeIdentifiers

struct ContentView: View {
    @StateObject private var model: ImportFlowViewModel
    @State private var isPickingFile = false

    init(backendURL: URL) {
        _model = StateObject(wrappedValue: ImportFlowViewModel(backendURL: backendURL))
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                header
                Spacer()
                content
                Spacer()
            }
            .padding()
            .navigationTitle("Fit → Health")
            .fileImporter(
                isPresented: $isPickingFile,
                allowedContentTypes: [.zip],
                allowsMultipleSelection: false
            ) { result in
                if case let .success(urls) = result, let url = urls.first {
                    Task { await model.convert(zipURL: url) }
                }
            }
        }
    }

    private var header: some View {
        VStack(spacing: 8) {
            Image(systemName: "heart.text.square.fill")
                .font(.system(size: 56))
                .foregroundStyle(.pink)
            Text("Import your Google Fit history into Apple Health.")
                .font(.subheadline)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private var content: some View {
        switch model.step {
        case .needsAuthorization:
            VStack(spacing: 16) {
                Text("First, allow this app to add data to Apple Health. It only ever **adds** data — it never reads or deletes anything.")
                    .font(.callout)
                    .multilineTextAlignment(.center)
                Button("Allow Health Access") { Task { await model.authorize() } }
                    .buttonStyle(.borderedProminent)
            }

        case .readyToPickFile:
            VStack(spacing: 16) {
                Text("Select the **Google Takeout .zip** containing your Fit export.")
                    .multilineTextAlignment(.center)
                Button("Choose Takeout .zip") { isPickingFile = true }
                    .buttonStyle(.borderedProminent)
            }

        case .converting:
            ProgressView("Reading and converting your export…")

        case let .review(summary):
            reviewView(summary)

        case let .importing(progress):
            VStack(spacing: 16) {
                ProgressView(value: progress)
                Text("Writing to Apple Health… \(Int(progress * 100))%")
                    .font(.callout)
                    .monospacedDigit()
            }

        case let .done(saved):
            VStack(spacing: 16) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 48)).foregroundStyle(.green)
                Text("Imported \(saved) items into Apple Health.")
                    .font(.headline).multilineTextAlignment(.center)
                Text("You can review or remove this data anytime in Health ▸ Profile ▸ Apps.")
                    .font(.footnote).foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                Button("Import Another") { model.reset() }
            }

        case let .failed(message):
            VStack(spacing: 16) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 40)).foregroundStyle(.orange)
                Text(message).font(.callout).multilineTextAlignment(.center)
                Button("Try Again") { model.reset() }
            }
        }
    }

    private func reviewView(_ summary: ImportFlowViewModel.NormalizedPayloadSummary) -> some View {
        VStack(spacing: 16) {
            Text("Ready to import").font(.headline)
            VStack(alignment: .leading, spacing: 6) {
                ForEach(summary.counts, id: \.label) { item in
                    HStack {
                        Text(item.label)
                        Spacer()
                        Text("\(item.count)").monospacedDigit().foregroundStyle(.secondary)
                    }
                }
            }
            .padding()
            .background(.quaternary, in: RoundedRectangle(cornerRadius: 12))

            Text("\(summary.totalSamples) items total"
                 + (summary.skippedCount > 0 ? " · \(summary.skippedCount) files skipped" : ""))
                .font(.footnote).foregroundStyle(.secondary)

            Button("Import \(summary.totalSamples) Items into Health") {
                Task { await model.startImport() }
            }
            .buttonStyle(.borderedProminent)
            .disabled(summary.totalSamples == 0)
        }
    }
}
