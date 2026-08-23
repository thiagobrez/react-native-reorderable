import AppKit
import Foundation
import Vision

struct Bounds: Codable {
  let x: Double
  let y: Double
  let width: Double
  let height: Double
}

struct Label: Codable {
  let text: String
  let bounds: Bounds
}

struct Sample: Codable {
  let path: String
  let labels: [Label]
  let destinationChangeRatio: Double?
}

struct Run: Codable {
  let configuration: String
  let scenario: String
  let kind: String
  let sourceLabel: String?
  let predecessorLabel: String?
  let targetLabel: String
  let visualTargetLabel: String?
  let baselineLabels: [Label]
  let samples: [Sample]
}

struct Report: Codable { let runs: [Run] }
struct ScenarioSpec: Decodable {
  let kind: String
  let sourceLabel: String?
  let predecessorLabel: String?
  let targetLabel: String
  let visualTargetLabel: String?
  let visualTargetLabelsByConfiguration: [String: String]?
}
struct Specs: Decodable {
  let configurations: [String]
  let scenarios: [String: ScenarioSpec]
}

enum FeedbackError: Error, CustomStringConvertible {
  case message(String)
  var description: String {
    switch self { case let .message(value): value }
  }
}

func recognize(_ url: URL) throws -> [Label] {
  guard let image = NSImage(contentsOf: url),
        let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
  else { throw FeedbackError.message("Cannot load \(url.path)") }
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.usesLanguageCorrection = false
  try VNImageRequestHandler(cgImage: cgImage).perform([request])
  return (request.results ?? []).compactMap { observation in
    guard let candidate = observation.topCandidates(1).first else { return nil }
    let box = observation.boundingBox
    return Label(
      text: candidate.string,
      bounds: Bounds(
        x: box.origin.x, y: box.origin.y,
        width: box.width, height: box.height
      )
    )
  }
}

func exactLabel(_ labels: [Label], _ text: String, path: String) throws -> Label {
  func comparable(_ value: String) -> String {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    // Vision can read the adjacent dashed destination border as a leading
    // apostrophe at simulator point resolution. Remove only that observed
    // prefix; the public label itself remains an exact match.
    return trimmed.hasPrefix("' ") ? String(trimmed.dropFirst(2)) : trimmed
  }
  let matches = labels.filter {
    comparable($0.text).localizedCaseInsensitiveCompare(comparable(text))
      == .orderedSame
  }
  guard matches.count == 1, let match = matches.first else {
    throw FeedbackError.message(
      "\(path): expected one OCR label \(text.debugDescription), found \(matches.count)"
    )
  }
  return match
}

func decodedImage(_ url: URL) throws -> CGImage {
  guard let image = NSImage(contentsOf: url),
        let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
  else { throw FeedbackError.message("Cannot load pixels from \(url.path)") }
  return cg
}

func rgba(
  _ image: CGImage, width: Int? = nil, height: Int? = nil
) throws -> (bytes: [UInt8], width: Int, height: Int) {
  let width = width ?? image.width
  let height = height ?? image.height
  let stride = width * 4
  var bytes = [UInt8](repeating: 0, count: stride * height)
  guard let context = CGContext(
    data: &bytes, width: width, height: height, bitsPerComponent: 8,
    bytesPerRow: stride, space: CGColorSpaceCreateDeviceRGB(),
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
  ) else { throw FeedbackError.message("Cannot create pixel context") }
  context.interpolationQuality = .high
  context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
  return (bytes, width, height)
}

func changeRatio(baseline: URL, sample: URL, region: Bounds) throws -> Double {
  let beforeImage = try decodedImage(baseline)
  let afterImage = try decodedImage(sample)
  guard
    beforeImage.width * afterImage.height
      == afterImage.width * beforeImage.height
  else {
    throw FeedbackError.message(
      "Screenshot aspect ratio changed during hold: "
        + "\(beforeImage.width)x\(beforeImage.height) to "
        + "\(afterImage.width)x\(afterImage.height)"
    )
  }
  // Agent Device emits simulator screenshots in logical points while simctl
  // emits physical pixels. Compare both at the baseline resolution when their
  // aspect ratio is unchanged so capture scale is not mistaken for UI change.
  let before = try rgba(beforeImage)
  let after = try rgba(
    afterImage, width: before.width, height: before.height
  )
  // Vision's public OCR bounds define the crop. Vision uses a bottom-left
  // normalized origin, while the bitmap rows are addressed from the top.
  let x0 = max(0, Int(region.x * Double(before.width)))
  let x1 = min(before.width, Int((region.x + region.width) * Double(before.width)))
  let y0 = max(0, Int((1 - region.y - region.height) * Double(before.height)))
  let y1 = min(before.height, Int((1 - region.y) * Double(before.height)))
  var changed = 0, total = 0
  for y in y0..<y1 {
    for x in x0..<x1 {
      let offset = (y * before.width + x) * 4
      let delta = (0..<3).reduce(0) {
        $0 + abs(Int(before.bytes[offset + $1]) - Int(after.bytes[offset + $1]))
      }
      if delta / 3 >= 20 { changed += 1 }
      total += 1
    }
  }
  guard total > 0 else { throw FeedbackError.message("Destination crop is empty") }
  return Double(changed) / Double(total)
}

func expandedLabelRegion(_ label: Label) -> Bounds {
  let box = label.bounds
  return Bounds(
    x: max(0, box.x - box.width * 0.15),
    y: max(0, box.y - box.height * 2.0),
    width: min(1, box.x + box.width * 1.15) - max(0, box.x - box.width * 0.15),
    height: min(1, box.y + box.height * 3.0) - max(0, box.y - box.height * 2.0)
  )
}

func insertionBandRegion(predecessor: Label, target: Label) -> Bounds {
  let predecessorCenter = predecessor.bounds.y + predecessor.bounds.height / 2
  let targetCenter = target.bounds.y + target.bounds.height / 2
  let lower = min(predecessorCenter, targetCenter)
  let upper = max(predecessorCenter, targetCenter)
  let left = max(0, min(predecessor.bounds.x, target.bounds.x))
  let right = min(
    1,
    max(
      predecessor.bounds.x + predecessor.bounds.width,
      target.bounds.x + target.bounds.width
    )
  )
  return Bounds(x: left, y: lower, width: right - left, height: upper - lower)
}

func analyzeRun(
  directory: URL, configuration: String, scenario: String, spec: ScenarioSpec
) throws -> Run {
  let baseline = directory.appendingPathComponent("baseline.png")
  guard FileManager.default.fileExists(atPath: baseline.path) else {
    throw FeedbackError.message("Missing \(baseline.path)")
  }
  let baselineLabels = try recognize(baseline)
  let resolvedVisualTargetLabel =
    spec.visualTargetLabelsByConfiguration?[configuration]
    ?? spec.visualTargetLabel
  let destinationRegion: Bounds
  if spec.kind == "drop" {
    destinationRegion = expandedLabelRegion(
      try exactLabel(
        baselineLabels, resolvedVisualTargetLabel ?? spec.targetLabel,
        path: baseline.path
      )
    )
  } else {
    guard let predecessorLabel = spec.predecessorLabel else {
      throw FeedbackError.message("Missing predecessor label for \(scenario)")
    }
    destinationRegion = insertionBandRegion(
      predecessor: try exactLabel(baselineLabels, predecessorLabel, path: baseline.path),
      target: try exactLabel(baselineLabels, spec.targetLabel, path: baseline.path)
    )
  }
  var samples: [Sample] = []
  for index in 1...3 {
    let url = directory.appendingPathComponent("sample-\(index).png")
    guard FileManager.default.fileExists(atPath: url.path) else {
      throw FeedbackError.message("Missing \(url.path)")
    }
    samples.append(Sample(
      path: url.path,
      labels: try recognize(url),
      destinationChangeRatio: try changeRatio(
        baseline: baseline, sample: url, region: destinationRegion
      )
    ))
  }
  return Run(
    configuration: configuration, scenario: scenario, kind: spec.kind,
    sourceLabel: spec.sourceLabel, predecessorLabel: spec.predecessorLabel,
    targetLabel: spec.targetLabel,
    visualTargetLabel: resolvedVisualTargetLabel,
    baselineLabels: baselineLabels,
    samples: samples
  )
}

do {
  if CommandLine.arguments.count == 3, CommandLine.arguments[1] == "--ocr" {
    let labels = try recognize(URL(fileURLWithPath: CommandLine.arguments[2]))
    let data = try JSONEncoder().encode(labels)
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data("\n".utf8))
    exit(0)
  }
  if CommandLine.arguments.count == 7, CommandLine.arguments[1] == "--case" {
    let directory = URL(fileURLWithPath: CommandLine.arguments[2])
    let specs = try JSONDecoder().decode(
      Specs.self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[3]))
    )
    let scenario = CommandLine.arguments[4]
    guard let spec = specs.scenarios[scenario] else {
      throw FeedbackError.message("Unknown scenario \(scenario)")
    }
    let run = try analyzeRun(
      directory: directory,
      configuration: CommandLine.arguments[5],
      scenario: scenario,
      spec: spec
    )
    let data = try JSONEncoder().encode(Report(runs: [run]))
    try data.write(
      to: URL(fileURLWithPath: CommandLine.arguments[6]), options: .atomic
    )
    exit(0)
  }
  guard CommandLine.arguments.count == 4 else {
    throw FeedbackError.message(
      "Usage: swift scripts/analyze-device-feedback.swift <feedback-root> <specs.json> <report.json> | --case <directory> <specs.json> <scenario> <configuration> <report.json>"
    )
  }
  let root = URL(fileURLWithPath: CommandLine.arguments[1])
  let specs = try JSONDecoder().decode(
    Specs.self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[2]))
  )
  var runs: [Run] = []
  for configuration in specs.configurations {
    for (scenario, spec) in specs.scenarios.sorted(by: { $0.key < $1.key }) {
      let directory = root.appendingPathComponent(configuration).appendingPathComponent(scenario)
      runs.append(try analyzeRun(
        directory: directory, configuration: configuration,
        scenario: scenario, spec: spec
      ))
    }
  }
  let data = try JSONEncoder().encode(Report(runs: runs))
  try data.write(to: URL(fileURLWithPath: CommandLine.arguments[3]), options: .atomic)
} catch {
  FileHandle.standardError.write(Data("\(error)\n".utf8))
  exit(1)
}
