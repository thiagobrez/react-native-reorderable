import CoreTransferable
import SwiftUI
import UIKit
import UniformTypeIdentifiers

private enum RNReorderableMode: String {
  case reorder
  case dragDrop
}

private enum RNReorderableEntryKind: String {
  case item
  case section
  case header
  case dropZone
}

private struct RNHostedEntry: Identifiable {
  let id: String
  let layoutID: String
  let itemID: String
  let collectionID: String
  let kind: RNReorderableEntryKind
  let view: UIView
}

private struct RNHostedSection: Identifiable {
  let id: String
  var header: RNHostedEntry?
  var items: [RNHostedEntry]
}

private struct RNReorderableRenderState {
  var mode: RNReorderableMode = .reorder
  var enabled = true
  var hostGeneration = 0
  var selectedIDs: [String] = []
  var items: [RNHostedEntry] = []
  var sections: [RNHostedSection] = []
  var dragEntries: [RNHostedEntry] = []
}

@MainActor
private final class RNReorderableModel: ObservableObject {
  @Published private(set) var state = RNReorderableRenderState()

  let layoutCoordinator: RNReorderableLayoutCoordinator
  var moveHandler: (([String], String, String) -> Void)?
  var dropHandler: (([String], String) -> Void)?

  init(layoutCoordinator: RNReorderableLayoutCoordinator) {
    self.layoutCoordinator = layoutCoordinator
  }

  func update(
    mode: String,
    entryKinds: [String],
    entryIDs: [String],
    collectionIDs: [String],
    orderedEntryIDs: [String],
    childViews: [UIView],
    selectedIDs: [String],
    enabled: Bool
  ) {
    let count = [
      entryKinds.count,
      entryIDs.count,
      collectionIDs.count,
      childViews.count,
    ].min() ?? 0
    let resolvedMode = RNReorderableMode(rawValue: mode) ?? .reorder
    var items: [RNHostedEntry] = []
    var sections: [RNHostedSection] = []
    var sectionIndices: [String: Int] = [:]
    var dragEntries: [RNHostedEntry] = []

    for index in 0..<count where entryKinds[index] == RNReorderableEntryKind.section.rawValue {
      let sectionID = entryIDs[index]
      guard sectionIndices[sectionID] == nil else { continue }
      sectionIndices[sectionID] = sections.count
      sections.append(RNHostedSection(id: sectionID, header: nil, items: []))
    }

    for index in 0..<count {
      guard let kind = RNReorderableEntryKind(rawValue: entryKinds[index]) else {
        continue
      }

      let entryID = entryIDs[index]
      let collectionID = collectionIDs[index]
      switch kind {
      case .section:
        continue
      case .header:
        guard let sectionIndex = sectionIndices[collectionID] else { continue }
        sections[sectionIndex].header = RNHostedEntry(
          id: "header:\(collectionID)",
          layoutID: "header:\(collectionID)",
          itemID: entryID,
          collectionID: collectionID,
          kind: kind,
          view: childViews[index]
        )
      case .item:
        let entry = RNHostedEntry(
          id: entryID,
          layoutID: "item:\(entryID)",
          itemID: entryID,
          collectionID: collectionID,
          kind: kind,
          view: childViews[index]
        )
        if resolvedMode == .dragDrop {
          dragEntries.append(entry)
        } else if collectionID.isEmpty {
          items.append(entry)
        } else if let sectionIndex = sectionIndices[collectionID] {
          sections[sectionIndex].items.append(entry)
        }
      case .dropZone:
        dragEntries.append(
          RNHostedEntry(
            id: "drop:\(entryID)",
            layoutID: "drop:\(entryID)",
            itemID: entryID,
            collectionID: collectionID,
            kind: kind,
            view: childViews[index]
          )
        )
      }
    }

    let orderIndices = Dictionary(
      uniqueKeysWithValues: orderedEntryIDs.enumerated().map { ($0.element, $0.offset) }
    )
    func orderIndex(_ layoutID: String) -> Int {
      orderIndices[layoutID] ?? .max
    }
    items.sort { orderIndex($0.layoutID) < orderIndex($1.layoutID) }
    sections.sort {
      orderIndex("section:\($0.id)") < orderIndex("section:\($1.id)")
    }
    for index in sections.indices {
      sections[index].items.sort {
        orderIndex($0.layoutID) < orderIndex($1.layoutID)
      }
    }
    dragEntries.sort { orderIndex($0.layoutID) < orderIndex($1.layoutID) }

    // A section layout owns nested representable containers while the other
    // modes are flat. Do not let SwiftUI reuse those containers across modes.
    let hostStructureChanged = state.mode != resolvedMode
      || state.sections.isEmpty != sections.isEmpty
    let hostGeneration = hostStructureChanged
      ? state.hostGeneration + 1
      : state.hostGeneration

    state = RNReorderableRenderState(
      mode: resolvedMode,
      enabled: enabled,
      hostGeneration: hostGeneration,
      selectedIDs: selectedIDs,
      items: items,
      sections: sections,
      dragEntries: dragEntries
    )
  }

  #if compiler(>=6.4)
  @available(iOS 27.0, *)
  func applySingleCollectionMove(
    _ difference: ReorderDifference<String, ReorderableSingleCollectionIdentifier>
  ) {
    var nextItems = state.items
    guard applyMove(
      sourceIDs: difference.sources,
      destination: difference.destination.position,
      items: &nextItems
    ) else { return }

    state.items = nextItems
    moveHandler?(
      difference.sources,
      "",
      destinationID(from: difference.destination.position)
    )
  }

  @available(iOS 27.0, *)
  func applySectionMove(_ difference: ReorderDifference<String, String>) {
    var nextSections = state.sections
    let entriesByID = Dictionary(
      uniqueKeysWithValues: nextSections.flatMap(\.items).map { ($0.itemID, $0) }
    )
    let movedEntries = difference.sources.compactMap { entriesByID[$0] }
    guard !movedEntries.isEmpty else { return }

    for index in nextSections.indices {
      nextSections[index].items.removeAll { difference.sources.contains($0.itemID) }
    }

    guard let destinationSectionIndex = nextSections.firstIndex(
      where: { $0.id == difference.destination.collectionID }
    ) else { return }

    let destinationIndex: Int
    switch difference.destination.position {
    case let .before(itemID):
      guard let index = nextSections[destinationSectionIndex].items.firstIndex(
        where: { $0.itemID == itemID }
      ) else { return }
      destinationIndex = index
    case .end:
      destinationIndex = nextSections[destinationSectionIndex].items.endIndex
    }

    nextSections[destinationSectionIndex].items.insert(
      contentsOf: movedEntries,
      at: destinationIndex
    )
    state.sections = nextSections
    moveHandler?(
      difference.sources,
      difference.destination.collectionID,
      destinationID(from: difference.destination.position)
    )
  }

  func emitDrop(_ itemIDs: [String], destinationID: String) {
    dropHandler?(itemIDs, destinationID)
  }

  @available(iOS 27.0, *)
  private func applyMove<CollectionID>(
    sourceIDs: [String],
    destination: ReorderDifference<String, CollectionID>.Destination.Position,
    items: inout [RNHostedEntry]
  ) -> Bool {
    let entriesByID = Dictionary(uniqueKeysWithValues: items.map { ($0.itemID, $0) })
    let movedEntries = sourceIDs.compactMap { entriesByID[$0] }
    guard !movedEntries.isEmpty else { return false }

    items.removeAll { sourceIDs.contains($0.itemID) }
    let destinationIndex: Int
    switch destination {
    case let .before(itemID):
      guard let index = items.firstIndex(where: { $0.itemID == itemID }) else {
        return false
      }
      destinationIndex = index
    case .end:
      destinationIndex = items.endIndex
    }
    items.insert(contentsOf: movedEntries, at: destinationIndex)
    return true
  }

  @available(iOS 27.0, *)
  private func destinationID<CollectionID>(
    from position: ReorderDifference<String, CollectionID>.Destination.Position
  ) -> String {
    switch position {
    case let .before(itemID): itemID
    case .end: ""
    }
  }
  #endif
}

#if compiler(>=6.4)
@available(iOS 27.0, *)
private struct RNLayoutIdentifierKey: LayoutValueKey {
  static let defaultValue = ""
}

@available(iOS 27.0, *)
private struct RNYogaLayout: Layout {
  let scope: String
  let coordinator: RNReorderableLayoutCoordinator

  func sizeThatFits(
    proposal: ProposedViewSize,
    subviews: Subviews,
    cache: inout Void
  ) -> CGSize {
    layout(proposal: proposal, subviews: subviews).size
  }

  func placeSubviews(
    in bounds: CGRect,
    proposal: ProposedViewSize,
    subviews: Subviews,
    cache: inout Void
  ) {
    let result = layout(
      proposal: ProposedViewSize(width: bounds.width, height: bounds.height),
      subviews: subviews
    )
    for (index, subview) in subviews.enumerated() where index < result.frames.count {
      let frame = result.frames[index].cgRectValue
      subview.place(
        at: CGPoint(x: bounds.minX + frame.minX, y: bounds.minY + frame.minY),
        anchor: .topLeading,
        proposal: ProposedViewSize(width: frame.width, height: frame.height)
      )
    }
  }

  private func layout(
    proposal: ProposedViewSize,
    subviews: Subviews
  ) -> RNReorderableLayoutResult {
    let identifiers = subviews.map { $0[RNLayoutIdentifierKey.self] }
    let measurementProposal = ProposedViewSize(width: proposal.width, height: nil)
    let intrinsicSizes = subviews.map {
      NSValue(cgSize: $0.sizeThatFits(measurementProposal))
    }
    return coordinator.layout(
      forScope: scope,
      orderedIdentifiers: identifiers,
      intrinsicSizes: intrinsicSizes,
      availableSize: CGSize(
        width: proposal.width ?? .nan,
        height: proposal.height ?? .nan
      )
    )
  }
}

@available(iOS 27.0, *)
private final class RNHostedReactContainer: UIView {
  private weak var hostedView: UIView?

  func host(_ view: UIView) {
    guard hostedView !== view else { return }
    hostedView?.removeFromSuperview()
    hostedView = view
    addSubview(view)
    setNeedsLayout()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    hostedView?.frame = bounds
  }
}

@available(iOS 27.0, *)
private struct RNHostedReactView: UIViewRepresentable {
  let entry: RNHostedEntry

  func makeUIView(context: Context) -> RNHostedReactContainer {
    let container = RNHostedReactContainer()
    container.backgroundColor = .clear
    container.host(entry.view)
    return container
  }

  func updateUIView(_ uiView: RNHostedReactContainer, context: Context) {
    uiView.host(entry.view)
  }

  func sizeThatFits(
    _ proposal: ProposedViewSize,
    uiView: RNHostedReactContainer,
    context: Context
  ) -> CGSize? {
    let size = entry.view.bounds.size
    guard size.width > 0 || size.height > 0 else { return nil }
    return size
  }

  static func dismantleUIView(_ uiView: RNHostedReactContainer, coordinator: Void) {
    uiView.subviews.forEach { $0.removeFromSuperview() }
  }
}

@available(iOS 27.0, *)
private struct RNLocalDragItem: Codable, Identifiable, Transferable {
  let id: String

  static var transferRepresentation: some TransferRepresentation {
    CodableRepresentation(contentType: .json)
  }
}

@available(iOS 27.0, *)
private struct RNSingleCollectionView: View {
  @ObservedObject var model: RNReorderableModel

  var body: some View {
    RNYogaLayout(scope: "root", coordinator: model.layoutCoordinator) {
      ForEach(model.state.items) { entry in
        RNHostedReactView(entry: entry)
          .contentShape(Rectangle())
          .layoutValue(key: RNLayoutIdentifierKey.self, value: entry.layoutID)
      }
      .reorderable()
    }
    .reorderContainer(for: RNHostedEntry.self, isEnabled: model.state.enabled) {
      model.applySingleCollectionMove($0)
    }
  }
}

@available(iOS 27.0, *)
private struct RNSectionedCollectionView: View {
  @ObservedObject var model: RNReorderableModel

  var body: some View {
    RNYogaLayout(scope: "root", coordinator: model.layoutCoordinator) {
      ForEach(model.state.sections) { section in
        RNYogaLayout(
          scope: "section:\(section.id)",
          coordinator: model.layoutCoordinator
        ) {
          if let header = section.header {
            RNHostedReactView(entry: header)
              .layoutValue(key: RNLayoutIdentifierKey.self, value: header.layoutID)
          }
          ForEach(section.items) { entry in
            RNHostedReactView(entry: entry)
              .contentShape(Rectangle())
              .layoutValue(key: RNLayoutIdentifierKey.self, value: entry.layoutID)
          }
          .reorderable(collectionID: section.id)
        }
        .layoutValue(
          key: RNLayoutIdentifierKey.self,
          value: "section:\(section.id)"
        )
      }
    }
    .reorderContainer(
      for: RNHostedEntry.self,
      in: String.self,
      isEnabled: model.state.enabled
    ) {
      model.applySectionMove($0)
    }
  }
}

@available(iOS 27.0, *)
private struct RNDragDropView: View {
  @ObservedObject var model: RNReorderableModel

  var body: some View {
    RNYogaLayout(scope: "root", coordinator: model.layoutCoordinator) {
      ForEach(model.state.dragEntries) { entry in
        entryView(entry)
          .layoutValue(key: RNLayoutIdentifierKey.self, value: entry.layoutID)
      }
    }
    .dragContainer(for: RNLocalDragItem.self) { (ids: [String]) in
      ids.map { RNLocalDragItem(id: $0) }
    }
    .dragContainerSelection(model.state.selectedIDs)
  }

  @ViewBuilder
  private func entryView(_ entry: RNHostedEntry) -> some View {
    switch entry.kind {
    case .item:
      RNHostedReactView(entry: entry)
        .contentShape(Rectangle())
        .draggable(containerItemID: entry.itemID)
    case .dropZone:
      RNHostedReactView(entry: entry)
        .contentShape(Rectangle())
        .dropDestination(for: RNLocalDragItem.self, isEnabled: model.state.enabled) {
          items, _ in
          model.emitDrop(items.map(\.id), destinationID: entry.itemID)
        }
    case .section, .header:
      EmptyView()
    }
  }
}

@available(iOS 27.0, *)
private struct RNReorderableRootView: View {
  @ObservedObject var model: RNReorderableModel

  var body: some View {
    Group {
      switch model.state.mode {
      case .reorder where !model.state.sections.isEmpty:
        RNSectionedCollectionView(model: model)
      case .reorder:
        RNSingleCollectionView(model: model)
      case .dragDrop:
        RNDragDropView(model: model)
      }
    }
    .id(model.state.hostGeneration)
  }
}
#endif

@objc(RNReorderableHostingView)
final class RNReorderableHostingView: UIView {
  @objc var moveHandler: (([String], String, String) -> Void)? {
    didSet { model.moveHandler = moveHandler }
  }

  @objc var dropHandler: (([String], String) -> Void)? {
    didSet { model.dropHandler = dropHandler }
  }

  private let model: RNReorderableModel
  private var hostingController: UIViewController?
  private weak var hostingParent: UIViewController?
  private let fallbackContainer = UIView()

  @objc(initWithLayoutCoordinator:)
  init(layoutCoordinator: RNReorderableLayoutCoordinator) {
    model = RNReorderableModel(layoutCoordinator: layoutCoordinator)
    super.init(frame: .zero)
    backgroundColor = .clear
    fallbackContainer.backgroundColor = .clear
    addSubview(fallbackContainer)
    installNativeHostIfAvailable()
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  @objc(updateWithMode:entryKinds:entryIds:collectionIds:orderedEntryIds:childViews:selectedIds:enabled:)
  func update(
    mode: String,
    entryKinds: [String],
    entryIDs: [String],
    collectionIDs: [String],
    orderedEntryIDs: [String],
    childViews: [UIView],
    selectedIDs: [String],
    enabled: Bool
  ) {
    if hostingController != nil {
      model.update(
        mode: mode,
        entryKinds: entryKinds,
        entryIDs: entryIDs,
        collectionIDs: collectionIDs,
        orderedEntryIDs: orderedEntryIDs,
        childViews: childViews,
        selectedIDs: selectedIDs,
        enabled: enabled
      )
      return
    }

    for (index, childView) in childViews.enumerated() {
      guard index < entryKinds.count, entryKinds[index] != "section" else {
        childView.removeFromSuperview()
        continue
      }
      fallbackContainer.addSubview(childView)
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    fallbackContainer.frame = bounds
    hostingController?.view.frame = bounds
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil {
      detachHostingController()
    } else {
      attachHostingControllerIfNeeded()
    }
  }

  @objc func invalidate() {
    moveHandler = nil
    dropHandler = nil
    detachHostingController()
    hostingController?.view.removeFromSuperview()
    hostingController = nil
    fallbackContainer.subviews.forEach { $0.removeFromSuperview() }
  }

  private func installNativeHostIfAvailable() {
    #if compiler(>=6.4)
      if #available(iOS 27.0, *) {
        let controller = UIHostingController(rootView: RNReorderableRootView(model: model))
        controller.view.backgroundColor = .clear
        hostingController = controller
        fallbackContainer.isHidden = true
        addSubview(controller.view)
      }
    #endif
  }

  private func attachHostingControllerIfNeeded() {
    guard
      hostingParent == nil,
      let controller = hostingController,
      let parent = nearestViewController()
    else { return }
    parent.addChild(controller)
    controller.didMove(toParent: parent)
    hostingParent = parent
  }

  private func detachHostingController() {
    guard let controller = hostingController, hostingParent != nil else { return }
    controller.willMove(toParent: nil)
    controller.removeFromParent()
    hostingParent = nil
  }

  private func nearestViewController() -> UIViewController? {
    var responder: UIResponder? = self
    while let current = responder {
      if let viewController = current as? UIViewController {
        return viewController
      }
      responder = current.next
    }
    return nil
  }
}
