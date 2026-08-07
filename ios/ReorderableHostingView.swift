import SwiftUI
import UIKit

private enum RNReorderableMode: String {
  case reorder
  case dragDrop
}

private enum RNReorderableEntryKind: String {
  case item
  case section
  case header
  case footer
  case dropZone
  case layout
  case content
}

private struct RNHostedEntry: Identifiable {
  let id: String
  let layoutID: String
  let itemID: String
  let collectionID: String
  let kind: RNReorderableEntryKind
  let parentID: String
  let view: UIView
}

private indirect enum RNHostedDragNode: Identifiable {
  case layout(RNHostedEntry, [RNHostedDragNode])
  case leaf(RNHostedEntry)

  var id: String {
    switch self {
    case let .layout(entry, _), let .leaf(entry): entry.layoutID
    }
  }
}

private struct RNHostedSection: Identifiable {
  let id: String
  var header: RNHostedEntry?
  var items: [RNHostedEntry]
  var footer: RNHostedEntry?
}

private struct RNReorderableRenderState {
  var mode: RNReorderableMode = .reorder
  var enabled = true
  var hostGeneration = 0
  var selectedIDs: [String] = []
  var acceptedDropZoneIDs: Set<String> = []
  var dropAcceptanceReady = true
  var debugTargetDropID: String?
  var debugActiveDropIDs: [String] = []
  var items: [RNHostedEntry] = []
  var sections: [RNHostedSection] = []
  var dragRoots: [RNHostedDragNode] = []
}

@MainActor
private final class RNReorderableModel: ObservableObject {
  @Published private(set) var state = RNReorderableRenderState()

  let layoutCoordinator: RNReorderableLayoutCoordinator
  var moveHandler: (([String], String, String) -> Void)?
  var dropHandler: (([String], String) -> Void)?
  var dragActivateHandler: (([String]) -> Void)?
  var interactionStateHandler: ((Bool) -> Void)?

  init(layoutCoordinator: RNReorderableLayoutCoordinator) {
    self.layoutCoordinator = layoutCoordinator
  }

  func update(
    mode: String,
    entryKinds: [String],
    entryIDs: [String],
    collectionIDs: [String],
    parentEntryIDs: [String],
    orderedEntryIDs: [String],
    childViews: [UIView],
    selectedIDs: [String],
    acceptedDropZoneIDs: [String],
    enabled: Bool
  ) {
    let count = [
      entryKinds.count,
      entryIDs.count,
      collectionIDs.count,
      parentEntryIDs.count,
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
      sections.append(RNHostedSection(id: sectionID, header: nil, items: [], footer: nil))
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
          parentID: parentEntryIDs[index],
          view: childViews[index]
        )
      case .footer:
        guard let sectionIndex = sectionIndices[collectionID] else { continue }
        sections[sectionIndex].footer = RNHostedEntry(
          id: "footer:\(collectionID)",
          layoutID: "footer:\(collectionID)",
          itemID: entryID,
          collectionID: collectionID,
          kind: kind,
          parentID: parentEntryIDs[index],
          view: childViews[index]
        )
      case .item:
        let entry = RNHostedEntry(
          id: entryID,
          layoutID: "item:\(entryID)",
          itemID: entryID,
          collectionID: collectionID,
          kind: kind,
          parentID: parentEntryIDs[index],
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
            parentID: parentEntryIDs[index],
            view: childViews[index]
          )
        )
      case .layout:
        dragEntries.append(
          RNHostedEntry(
            id: entryID,
            layoutID: entryID,
            itemID: entryID,
            collectionID: collectionID,
            kind: kind,
            parentID: parentEntryIDs[index],
            view: childViews[index]
          )
        )
      case .content:
        dragEntries.append(
          RNHostedEntry(
            id: entryID,
            layoutID: entryID,
            itemID: entryID,
            collectionID: collectionID,
            kind: kind,
            parentID: parentEntryIDs[index],
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
    func dragNodes(parentID: String) -> [RNHostedDragNode] {
      dragEntries.compactMap { entry in
        guard entry.parentID == parentID else { return nil }
        return entry.kind == .layout
          ? .layout(entry, dragNodes(parentID: entry.id))
          : .leaf(entry)
      }
    }

    // A section layout owns nested representable containers while the other
    // modes are flat. Do not let SwiftUI reuse those containers across modes.
    let hostStructureChanged = state.mode != resolvedMode
      || state.sections.isEmpty != sections.isEmpty
    let structureGeneration = hostStructureChanged
      ? state.hostGeneration + 1
      : state.hostGeneration

    let hostGeneration = state.enabled && !enabled
      ? structureGeneration + 1
      : structureGeneration
    state = RNReorderableRenderState(
      mode: resolvedMode,
      enabled: enabled,
      hostGeneration: hostGeneration,
      selectedIDs: selectedIDs,
      acceptedDropZoneIDs: Set(acceptedDropZoneIDs),
      dropAcceptanceReady: true,
      debugTargetDropID: state.debugTargetDropID,
      debugActiveDropIDs: state.debugActiveDropIDs,
      items: items,
      sections: sections,
      dragRoots: dragNodes(parentID: "")
    )
  }

  func invalidateHostedLayout() {
    state.hostGeneration += 1
  }

  func cancelInteraction() {
    // Replacing the SwiftUI reorder container ends any in-flight native drag
    // and rebuilds presentation from the latest application-owned entries.
    state.hostGeneration += 1
    state.acceptedDropZoneIDs = []
    state.dropAcceptanceReady = true
    interactionStateHandler?(false)
  }

  #if compiler(>=6.4)
  @available(iOS 27.0, *)
  func applySingleCollectionMove(
    _ difference: ReorderDifference<String, ReorderableSingleCollectionIdentifier>,
    hostGeneration: Int
  ) {
    guard hostGeneration == state.hostGeneration else { return }
    var nextItems = state.items
    guard let sourceIDs = applyMove(
      sourceIDs: difference.sources,
      destination: difference.destination.position,
      items: &nextItems
    ) else { return }

    state.items = nextItems
    moveHandler?(
      sourceIDs,
      "",
      destinationID(from: difference.destination.position)
    )
  }

  @available(iOS 27.0, *)
  func applySectionMove(
    _ difference: ReorderDifference<String, String>,
    hostGeneration: Int
  ) {
    guard hostGeneration == state.hostGeneration else { return }
    var nextSections = state.sections
    guard let movedEntries = resolveMoveSet(
      sourceIDs: difference.sources,
      items: nextSections.flatMap(\.items)
    ) else { return }

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
      movedEntries.map(\.itemID),
      difference.destination.collectionID,
      destinationID(from: difference.destination.position)
    )
  }

  func emitDrop(_ itemIDs: [String], destinationID: String) {
    dropHandler?(itemIDs, destinationID)
  }

  func activateDrop(_ itemIDs: [String]) {
    // Do not let acceptance from a previous activation leak into this one.
    // React will publish the immutable activation snapshot back through props.
    state.acceptedDropZoneIDs = []
    state.dropAcceptanceReady = false
    interactionStateHandler?(true)
    dragActivateHandler?(itemIDs)
  }

  func endDropInteraction() {
    state.acceptedDropZoneIDs = []
    state.dropAcceptanceReady = true
    interactionStateHandler?(false)
  }

  #if DEBUG
  func debugBeginDrop(_ itemIDs: [String]) {
    guard state.enabled, state.mode == .dragDrop, !itemIDs.isEmpty else { return }
    state.debugActiveDropIDs = itemIDs
    state.acceptedDropZoneIDs = []
    state.dropAcceptanceReady = false
    interactionStateHandler?(true)
    dragActivateHandler?(itemIDs)
  }

  func debugTargetDrop(_ destinationID: String) {
    guard state.enabled, state.mode == .dragDrop else { return }
    state.debugTargetDropID = destinationID
  }

  func debugEmitTerminalDrop(outside: Bool) {
    defer { state.debugTargetDropID = nil }
    guard
      !outside,
      let destinationID = state.debugTargetDropID
    else { return }
    let itemIDs = state.debugActiveDropIDs
    state.debugActiveDropIDs = []
    guard !itemIDs.isEmpty else { return }
    dropHandler?(itemIDs, destinationID)
  }
  #endif

  #if DEBUG
  func debugEmitTerminalReorder(
    sourceIDs: [String],
    destinationCollectionID: String,
    destinationBeforeID: String,
    hostGeneration: Int
  ) {
    guard
      hostGeneration == state.hostGeneration,
      state.enabled,
      state.mode == .reorder,
      !sourceIDs.isEmpty
    else { return }
    let availableItems = state.sections.isEmpty
      ? state.items
      : state.sections.flatMap(\.items)
    guard let movedEntries = resolveMoveSet(
      sourceIDs: sourceIDs,
      items: availableItems
    ) else { return }

    let destinationItems: [RNHostedEntry]
    if state.sections.isEmpty {
      guard destinationCollectionID.isEmpty else { return }
      destinationItems = state.items
    } else {
      guard let section = state.sections.first(
        where: { $0.id == destinationCollectionID }
      ) else { return }
      destinationItems = section.items
    }
    guard
      destinationBeforeID.isEmpty
        || destinationItems.contains(where: { $0.itemID == destinationBeforeID }),
      !sourceIDs.contains(destinationBeforeID)
    else { return }

    moveHandler?(
      movedEntries.map(\.itemID),
      destinationCollectionID,
      destinationBeforeID
    )
  }
  #endif

  @available(iOS 27.0, *)
  private func applyMove<CollectionID>(
    sourceIDs: [String],
    destination: ReorderDifference<String, CollectionID>.Destination.Position,
    items: inout [RNHostedEntry]
  ) -> [String]? {
    guard let movedEntries = resolveMoveSet(
      sourceIDs: sourceIDs,
      items: items
    ) else { return nil }

    items.removeAll { sourceIDs.contains($0.itemID) }
    let destinationIndex: Int
    switch destination {
    case let .before(itemID):
      guard let index = items.firstIndex(where: { $0.itemID == itemID }) else {
        return nil
      }
      destinationIndex = index
    case .end:
      destinationIndex = items.endIndex
    }
    items.insert(contentsOf: movedEntries, at: destinationIndex)
    return movedEntries.map(\.itemID)
  }

  private func resolveMoveSet(
    sourceIDs: [String],
    items: [RNHostedEntry]
  ) -> [RNHostedEntry]? {
    let sourceSet = Set(sourceIDs)
    let movedEntries = items.filter { sourceSet.contains($0.itemID) }
    guard
      !movedEntries.isEmpty,
      movedEntries.count == sourceSet.count,
      sourceSet.count == sourceIDs.count
    else { return nil }
    return movedEntries
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
private final class RNLocalDragPayload: NSObject {
  let itemIDs: [String]

  init(itemIDs: [String]) {
    self.itemIDs = itemIDs
  }
}

@available(iOS 27.0, *)
private final class RNItemDragDelegate: NSObject, UIDragInteractionDelegate,
  UIGestureRecognizerDelegate
{
  let itemID: String
  let model: RNReorderableModel

  init(itemID: String, model: RNReorderableModel) {
    self.itemID = itemID
    self.model = model
  }

  func dragInteraction(
    _ interaction: UIDragInteraction,
    itemsForBeginning session: any UIDragSession
  ) -> [UIDragItem] {
    guard model.state.enabled else { return [] }
    let itemIDs = [itemID]
    model.activateDrop(itemIDs)
    let item = UIDragItem(itemProvider: NSItemProvider(object: itemID as NSString))
    item.localObject = RNLocalDragPayload(itemIDs: itemIDs)
    return [item]
  }

  func dragInteraction(
    _ interaction: UIDragInteraction,
    session: any UIDragSession,
    didEndWith operation: UIDropOperation
  ) {
    model.endDropInteraction()
  }

  @objc func pointerGestureChanged(_ recognizer: UILongPressGestureRecognizer) {
    guard
      recognizer.state == .ended || recognizer.state == .cancelled
        || recognizer.state == .failed
    else { return }
    // A source-pointer end is observable even when no destination accepts the
    // session. Defer one turn so a successful drop event is delivered first.
    DispatchQueue.main.async { [model] in
      model.endDropInteraction()
    }
  }

  func gestureRecognizer(
    _ gestureRecognizer: UIGestureRecognizer,
    shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
  ) -> Bool {
    true
  }
}

@available(iOS 27.0, *)
private final class RNZoneDropDelegate: NSObject, UIDropInteractionDelegate {
  let destinationID: String
  let model: RNReorderableModel
  weak var view: UIView?
  private var targeted = false

  init(destinationID: String, model: RNReorderableModel) {
    self.destinationID = destinationID
    self.model = model
  }

  private func payload(_ session: any UIDropSession) -> RNLocalDragPayload? {
    session.items.lazy.compactMap { $0.localObject as? RNLocalDragPayload }.first
  }

  private var accepted: Bool {
    model.state.acceptedDropZoneIDs.contains(destinationID)
  }

  private var acceptanceReady: Bool {
    model.state.dropAcceptanceReady
  }

  private func updateFeedback() {
    guard let layer = view?.layer else { return }
    layer.borderWidth = targeted ? 3 : 0
    layer.borderColor = targeted
      ? (
        acceptanceReady
          ? (accepted ? UIColor.systemGreen : UIColor.systemRed)
          : UIColor.systemYellow
      ).cgColor
      : UIColor.clear.cgColor
    layer.cornerRadius = 10
  }

  func refreshFeedback() {
    updateFeedback()
  }

  func dropInteraction(
    _ interaction: UIDropInteraction,
    canHandle session: any UIDropSession
  ) -> Bool {
    model.state.enabled && payload(session) != nil
  }

  func dropInteraction(
    _ interaction: UIDropInteraction,
    sessionDidEnter session: any UIDropSession
  ) {
    targeted = true
    updateFeedback()
  }

  func dropInteraction(
    _ interaction: UIDropInteraction,
    sessionDidUpdate session: any UIDropSession
  ) -> UIDropProposal {
    updateFeedback()
    // While JS evaluates the activation snapshot, keep UIKit's drop path open
    // so a quick release still yields a terminal candidate. Yellow feedback
    // represents this pending state; ready acceptance remains green or red.
    return UIDropProposal(operation: !acceptanceReady || accepted ? .move : .cancel)
  }

  func dropInteraction(
    _ interaction: UIDropInteraction,
    performDrop session: any UIDropSession
  ) {
    // A pending candidate is reconciled against the activation snapshot in JS.
    // Once ready, a known rejection must never cross the native boundary.
    guard !acceptanceReady || accepted, let payload = payload(session) else { return }
    model.emitDrop(payload.itemIDs, destinationID: destinationID)
  }

  func dropInteraction(
    _ interaction: UIDropInteraction,
    sessionDidExit session: any UIDropSession
  ) {
    targeted = false
    updateFeedback()
  }

  func dropInteraction(
    _ interaction: UIDropInteraction,
    sessionDidEnd session: any UIDropSession
  ) {
    targeted = false
    updateFeedback()
  }
}

@available(iOS 27.0, *)
private struct RNHostedDraggableReactView: UIViewRepresentable {
  let entry: RNHostedEntry
  @ObservedObject var model: RNReorderableModel

  func makeCoordinator() -> RNItemDragDelegate {
    RNItemDragDelegate(itemID: entry.itemID, model: model)
  }

  func makeUIView(context: Context) -> RNHostedReactContainer {
    let container = RNHostedReactContainer()
    container.backgroundColor = .clear
    container.host(entry.view)
    container.addInteraction(UIDragInteraction(delegate: context.coordinator))
    let pointerEndMonitor = UILongPressGestureRecognizer(
      target: context.coordinator,
      action: #selector(RNItemDragDelegate.pointerGestureChanged(_:))
    )
    pointerEndMonitor.minimumPressDuration = 0.35
    pointerEndMonitor.cancelsTouchesInView = false
    pointerEndMonitor.delegate = context.coordinator
    container.addGestureRecognizer(pointerEndMonitor)
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
    return size.width > 0 || size.height > 0 ? size : nil
  }
}

@available(iOS 27.0, *)
private struct RNHostedDropZoneReactView: UIViewRepresentable {
  let entry: RNHostedEntry
  @ObservedObject var model: RNReorderableModel

  func makeCoordinator() -> RNZoneDropDelegate {
    RNZoneDropDelegate(destinationID: entry.itemID, model: model)
  }

  func makeUIView(context: Context) -> RNHostedReactContainer {
    let container = RNHostedReactContainer()
    container.backgroundColor = .clear
    container.host(entry.view)
    context.coordinator.view = container
    container.addInteraction(UIDropInteraction(delegate: context.coordinator))
    return container
  }

  func updateUIView(_ uiView: RNHostedReactContainer, context: Context) {
    uiView.host(entry.view)
    context.coordinator.refreshFeedback()
  }

  func sizeThatFits(
    _ proposal: ProposedViewSize,
    uiView: RNHostedReactContainer,
    context: Context
  ) -> CGSize? {
    let size = entry.view.bounds.size
    return size.width > 0 || size.height > 0 ? size : nil
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
      [hostGeneration = model.state.hostGeneration] difference in
      model.applySingleCollectionMove(
        difference,
        hostGeneration: hostGeneration
      )
    }
    .dragContainerSelection(model.state.selectedIDs)
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
          if let footer = section.footer {
            RNHostedReactView(entry: footer)
              .layoutValue(key: RNLayoutIdentifierKey.self, value: footer.layoutID)
          }
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
      [hostGeneration = model.state.hostGeneration] difference in
      model.applySectionMove(difference, hostGeneration: hostGeneration)
    }
    .dragContainerSelection(model.state.selectedIDs)
  }
}

@available(iOS 27.0, *)
private struct RNDragDropView: View {
  @ObservedObject var model: RNReorderableModel

  var body: some View {
    RNYogaLayout(scope: "root", coordinator: model.layoutCoordinator) {
      ForEach(model.state.dragRoots) { node in
        RNDragNodeView(node: node, model: model)
      }
    }
  }

}

@available(iOS 27.0, *)
private struct RNDragNodeView: View {
  let node: RNHostedDragNode
  @ObservedObject var model: RNReorderableModel

  var body: AnyView {
    switch node {
    case let .layout(entry, children):
      return AnyView(
        ZStack {
          RNHostedReactView(entry: entry)
          RNYogaLayout(scope: entry.layoutID, coordinator: model.layoutCoordinator) {
            ForEach(children) { child in
              RNDragNodeView(node: child, model: model)
            }
          }
        }
        .layoutValue(key: RNLayoutIdentifierKey.self, value: entry.layoutID)
      )
    case let .leaf(entry) where entry.kind == .item:
      return AnyView(
        RNHostedDraggableReactView(entry: entry, model: model)
          .contentShape(Rectangle())
          .layoutValue(key: RNLayoutIdentifierKey.self, value: entry.layoutID)
      )
    case let .leaf(entry) where entry.kind == .dropZone:
      return AnyView(
        RNHostedDropZoneReactView(entry: entry, model: model)
          .contentShape(Rectangle())
          .overlay {
            RoundedRectangle(cornerRadius: 10)
              .stroke(
                model.state.debugTargetDropID == entry.itemID
                  ? (
                    model.state.dropAcceptanceReady
                      ? (model.state.acceptedDropZoneIDs.contains(entry.itemID)
                        ? Color.green : Color.red)
                      : Color.yellow
                  )
                  : Color.clear,
                lineWidth: 3
              )
          }
          .layoutValue(key: RNLayoutIdentifierKey.self, value: entry.layoutID)
      )
    case let .leaf(entry) where entry.kind == .content:
      return AnyView(
        RNHostedReactView(entry: entry)
          .layoutValue(key: RNLayoutIdentifierKey.self, value: entry.layoutID)
      )
    case .leaf:
      return AnyView(EmptyView())
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
  @objc var dragActivateHandler: (([String]) -> Void)? {
    didSet { model.dragActivateHandler = dragActivateHandler }
  }

  @objc var interactionStateHandler: ((Bool) -> Void)? {
    didSet { model.interactionStateHandler = interactionStateHandler }
  }

  private let model: RNReorderableModel
  private var hostingController: UIViewController?
  private weak var hostingParent: UIViewController?
  private let fallbackContainer = UIView()
  private var debugInteractionActive = false
  private var debugInteractionGeneration: Int?

  @objc(initWithLayoutCoordinator:)
  init(layoutCoordinator: RNReorderableLayoutCoordinator) {
    model = RNReorderableModel(layoutCoordinator: layoutCoordinator)
    super.init(frame: .zero)
    backgroundColor = .clear
    fallbackContainer.backgroundColor = .clear
    addSubview(fallbackContainer)
    installNativeHostIfAvailable()
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(cancelActiveInteraction),
      name: UIApplication.willResignActiveNotification,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(cancelActiveInteraction),
      name: UIApplication.didEnterBackgroundNotification,
      object: nil
    )
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  @objc(updateWithMode:entryKinds:entryIds:collectionIds:parentEntryIds:orderedEntryIds:childViews:selectedIds:acceptedDropZoneIds:enabled:)
  func update(
    mode: String,
    entryKinds: [String],
    entryIDs: [String],
    collectionIDs: [String],
    parentEntryIDs: [String],
    orderedEntryIDs: [String],
    childViews: [UIView],
    selectedIDs: [String],
    acceptedDropZoneIDs: [String],
    enabled: Bool
  ) {
    if hostingController != nil {
      model.update(
        mode: mode,
        entryKinds: entryKinds,
        entryIDs: entryIDs,
        collectionIDs: collectionIDs,
        parentEntryIDs: parentEntryIDs,
        orderedEntryIDs: orderedEntryIDs,
        childViews: childViews,
        selectedIDs: selectedIDs,
        acceptedDropZoneIDs: acceptedDropZoneIDs,
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
      cancelActiveInteraction()
      detachHostingController()
    } else {
      attachHostingControllerIfNeeded()
    }
  }

  @objc func invalidate() {
    cancelActiveInteraction()
    NotificationCenter.default.removeObserver(self)
    moveHandler = nil
    dropHandler = nil
    dragActivateHandler = nil
    interactionStateHandler = nil
    detachHostingController()
    hostingController?.view.removeFromSuperview()
    hostingController = nil
    fallbackContainer.subviews.forEach { $0.removeFromSuperview() }
  }

  @objc private func cancelActiveInteraction() {
    guard hostingController != nil else { return }
    model.cancelInteraction()
    if debugInteractionActive {
      debugInteractionActive = false
    }
  }

  @objc func invalidateHostedLayout() {
    guard hostingController != nil else { return }
    model.invalidateHostedLayout()
    hostingController?.view.invalidateIntrinsicContentSize()
    hostingController?.view.setNeedsLayout()
  }

  #if DEBUG
  @objc func debugBeginInteraction() {
    guard !debugInteractionActive else { return }
    debugInteractionActive = true
    debugInteractionGeneration = model.state.hostGeneration
    interactionStateHandler?(true)
  }

  @objc(debugBeginDropWithItemIds:)
  func debugBeginDrop(itemIDs: [String]) {
    debugInteractionActive = true
    model.debugBeginDrop(itemIDs)
  }

  @objc(debugTargetDropWithDestinationId:)
  func debugTargetDrop(destinationID: String) {
    model.debugTargetDrop(destinationID)
  }

  @objc(debugEmitTerminalDropOutside:)
  func debugEmitTerminalDrop(outside: Bool) {
    model.debugEmitTerminalDrop(outside: outside)
    if debugInteractionActive {
      debugInteractionActive = false
      interactionStateHandler?(false)
    }
  }

  @objc(debugEmitTerminalReorderWithSourceIds:destinationCollectionId:destinationBeforeId:)
  func debugEmitTerminalReorder(
    sourceIDs: [String],
    destinationCollectionID: String,
    destinationBeforeID: String
  ) {
    guard let hostGeneration = debugInteractionGeneration else { return }
    model.debugEmitTerminalReorder(
      sourceIDs: sourceIDs,
      destinationCollectionID: destinationCollectionID,
      destinationBeforeID: destinationBeforeID,
      hostGeneration: hostGeneration
    )
    debugInteractionGeneration = nil
    if debugInteractionActive {
      debugInteractionActive = false
      interactionStateHandler?(false)
    }
  }
  #endif

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
