#import "ReorderableView.h"

#import "ReorderableHostingView.h"
#import "ReorderableLayoutCoordinator.h"

#import <React/RCTConversions.h>

#import <react/renderer/components/ReorderableViewSpec/ComponentDescriptors.h>
#import <react/renderer/components/ReorderableViewSpec/EventEmitters.h>
#import <react/renderer/components/ReorderableViewSpec/Props.h>
#import <react/renderer/components/ReorderableViewSpec/RCTComponentViewHelpers.h>
#import <react/renderer/components/view/YogaStylableProps.h>

#import <yoga/YGNode.h>
#import <yoga/YGNodeLayout.h>
#import <yoga/node/Node.h>
#import <yoga/style/Style.h>

#import "RCTFabricComponentsPlugins.h"

#include <cmath>
#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

using namespace facebook;
using namespace facebook::react;

namespace {

struct RNMeasureContext {
  CGSize intrinsicSize;
};

static float RNMeasuredDimension(float intrinsic, float available, YGMeasureMode mode)
{
  switch (mode) {
    case YGMeasureModeExactly:
      return available;
    case YGMeasureModeAtMost:
      return std::min(intrinsic, available);
    case YGMeasureModeUndefined:
      return intrinsic;
  }
  return intrinsic;
}

static YGSize RNMeasureNode(
    YGNodeConstRef node,
    float availableWidth,
    YGMeasureMode widthMode,
    float availableHeight,
    YGMeasureMode heightMode)
{
  auto context = static_cast<RNMeasureContext *>(YGNodeGetContext(node));
  if (context == nullptr) {
    return YGSize{0, 0};
  }

  return YGSize{
      RNMeasuredDimension(context->intrinsicSize.width, availableWidth, widthMode),
      RNMeasuredDimension(context->intrinsicSize.height, availableHeight, heightMode)};
}

static NSString *RNString(const std::string &value)
{
  return [NSString stringWithUTF8String:value.c_str()] ?: @"";
}

static NSArray<NSString *> *RNStringArray(const std::vector<std::string> &values)
{
  NSMutableArray<NSString *> *result = [NSMutableArray arrayWithCapacity:values.size()];
  for (const auto &value : values) {
    [result addObject:RNString(value)];
  }
  return result;
}

static NSString *RNJSONString(NSArray<NSString *> *values)
{
  NSData *data = [NSJSONSerialization dataWithJSONObject:values options:0 error:nil];
  if (data == nil) {
    return @"[]";
  }
  return [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] ?: @"[]";
}

static std::string RNStdString(NSString *value)
{
  return value.UTF8String == nullptr ? std::string{} : std::string{value.UTF8String};
}

static std::string RNLayoutIdentifier(NSString *kind, NSString *entryId, NSString *collectionId)
{
  if ([kind isEqualToString:@"section"]) {
    return RNStdString([@"section:" stringByAppendingString:entryId]);
  }
  if ([kind isEqualToString:@"header"]) {
    return RNStdString([@"header:" stringByAppendingString:collectionId]);
  }
  if ([kind isEqualToString:@"dropZone"]) {
    return RNStdString([@"drop:" stringByAppendingString:entryId]);
  }
  return RNStdString([@"item:" stringByAppendingString:entryId]);
}

} // namespace

@implementation RNReorderableLayoutResult

- (instancetype)initWithSize:(CGSize)size frames:(NSArray<NSValue *> *)frames
{
  if (self = [super init]) {
    _size = size;
    _frames = [frames copy];
  }
  return self;
}

@end

@interface RNReorderableLayoutCoordinator (Internal)

- (void)clearStyles;
- (void)setYogaStyle:(const yoga::Style &)style forIdentifier:(NSString *)identifier;
- (void)setYogaStyle:(const yoga::Style &)style forScope:(NSString *)scope;

@end


@implementation RNReorderableLayoutCoordinator {
  std::unordered_map<std::string, yoga::Style> _entryStyles;
  std::unordered_map<std::string, yoga::Style> _scopeStyles;
}

- (void)clearStyles
{
  _entryStyles.clear();
  _scopeStyles.clear();
}

- (void)setYogaStyle:(const yoga::Style &)style forIdentifier:(NSString *)identifier
{
  _entryStyles[RNStdString(identifier)] = style;
}

- (void)setYogaStyle:(const yoga::Style &)style forScope:(NSString *)scope
{
  _scopeStyles[RNStdString(scope)] = style;
}

- (RNReorderableLayoutResult *)layoutForScope:(NSString *)scope
                           orderedIdentifiers:(NSArray<NSString *> *)orderedIdentifiers
                               intrinsicSizes:(NSArray<NSValue *> *)intrinsicSizes
                                availableSize:(CGSize)availableSize
{
  YGNodeRef root = YGNodeNew();
  auto rootNode = reinterpret_cast<yoga::Node *>(root);
  const auto scopeStyle = _scopeStyles.find(RNStdString(scope));
  if (scopeStyle != _scopeStyles.end()) {
    rootNode->setStyle(scopeStyle->second);
  }

  if (std::isfinite(availableSize.width)) {
    rootNode->style().setDimension(
        yoga::Dimension::Width,
        yoga::StyleSizeLength::points(availableSize.width));
  }
  if (std::isfinite(availableSize.height)) {
    rootNode->style().setDimension(
        yoga::Dimension::Height,
        yoga::StyleSizeLength::points(availableSize.height));
  }

  const NSUInteger count = MIN(orderedIdentifiers.count, intrinsicSizes.count);
  std::vector<std::unique_ptr<RNMeasureContext>> contexts;
  contexts.reserve(count);

  for (NSUInteger index = 0; index < count; index++) {
    YGNodeRef child = YGNodeNew();
    auto childNode = reinterpret_cast<yoga::Node *>(child);
    const auto entryStyle = _entryStyles.find(RNStdString(orderedIdentifiers[index]));
    if (entryStyle != _entryStyles.end()) {
      childNode->setStyle(entryStyle->second);
    }

    auto context = std::make_unique<RNMeasureContext>();
    context->intrinsicSize = intrinsicSizes[index].CGSizeValue;
    YGNodeSetContext(child, context.get());
    YGNodeSetMeasureFunc(child, RNMeasureNode);
    contexts.push_back(std::move(context));
    YGNodeInsertChild(root, child, index);
  }

  const float width = std::isfinite(availableSize.width) ? availableSize.width : YGUndefined;
  const float height = std::isfinite(availableSize.height) ? availableSize.height : YGUndefined;
  YGNodeCalculateLayout(root, width, height, YGDirectionLTR);

  NSMutableArray<NSValue *> *frames = [NSMutableArray arrayWithCapacity:count];
  for (NSUInteger index = 0; index < count; index++) {
    YGNodeRef child = YGNodeGetChild(root, index);
    CGRect frame = CGRectMake(
        YGNodeLayoutGetLeft(child),
        YGNodeLayoutGetTop(child),
        YGNodeLayoutGetWidth(child),
        YGNodeLayoutGetHeight(child));
    [frames addObject:[NSValue valueWithCGRect:frame]];
  }

  CGSize size = CGSizeMake(YGNodeLayoutGetWidth(root), YGNodeLayoutGetHeight(root));
  YGNodeFreeRecursive(root);
  return [[RNReorderableLayoutResult alloc] initWithSize:size frames:frames];
}

@end

@implementation ReorderableView {
  RNReorderableHostingView *_hostingView;
  RNReorderableLayoutCoordinator *_layoutCoordinator;
  NSMutableArray<UIView<RCTComponentViewProtocol> *> *_childComponentViews;
  EventEmitter::Shared _reorderableEventEmitter;
  BOOL _needsSync;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<ReorderableViewComponentDescriptor>();
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps = std::make_shared<const ReorderableViewProps>();
    _props = defaultProps;

    _layoutCoordinator = [RNReorderableLayoutCoordinator new];
    _hostingView = [[RNReorderableHostingView alloc] initWithLayoutCoordinator:_layoutCoordinator];
    _childComponentViews = [NSMutableArray new];
    _needsSync = YES;

    __weak ReorderableView *weakSelf = self;
    _hostingView.moveHandler = ^(
        NSArray<NSString *> *sourceIds,
        NSString *destinationCollectionId,
        NSString *destinationBeforeId) {
      ReorderableView *strongSelf = weakSelf;
      if (strongSelf == nil || strongSelf->_reorderableEventEmitter == nullptr) {
        return;
      }
      auto emitter = std::static_pointer_cast<const ReorderableViewEventEmitter>(
          strongSelf->_reorderableEventEmitter);
      ReorderableViewEventEmitter::OnMove event;
      event.sourceIdsJson = RNStdString(RNJSONString(sourceIds));
      event.destinationCollectionId = RNStdString(destinationCollectionId);
      event.destinationBeforeId = RNStdString(destinationBeforeId);
      emitter->onMove(event);
    };
    _hostingView.dropHandler = ^(NSArray<NSString *> *itemIds, NSString *destinationId) {
      ReorderableView *strongSelf = weakSelf;
      if (strongSelf == nil || strongSelf->_reorderableEventEmitter == nullptr) {
        return;
      }
      auto emitter = std::static_pointer_cast<const ReorderableViewEventEmitter>(
          strongSelf->_reorderableEventEmitter);
      ReorderableViewEventEmitter::OnDrop event;
      event.itemIdsJson = RNStdString(RNJSONString(itemIds));
      event.destinationId = RNStdString(destinationId);
      emitter->onDrop(event);
    };

    self.contentView = _hostingView;
  }
  return self;
}

- (void)mountChildComponentView:(UIView<RCTComponentViewProtocol> *)childComponentView
                          index:(NSInteger)index
{
  [childComponentView removeFromSuperview];
  [_childComponentViews insertObject:childComponentView atIndex:index];
  _needsSync = YES;
}

- (void)unmountChildComponentView:(UIView<RCTComponentViewProtocol> *)childComponentView
                            index:(NSInteger)index
{
  if (index < _childComponentViews.count && _childComponentViews[index] == childComponentView) {
    [_childComponentViews removeObjectAtIndex:index];
  } else {
    [_childComponentViews removeObject:childComponentView];
  }
  [childComponentView removeFromSuperview];
  _needsSync = YES;
}

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
  [super updateProps:props oldProps:oldProps];
  _needsSync = YES;
}

- (void)updateEventEmitter:(EventEmitter::Shared const &)eventEmitter
{
  _reorderableEventEmitter = eventEmitter;
  [super updateEventEmitter:eventEmitter];
}

- (void)finalizeUpdates:(RNComponentViewUpdateMask)updateMask
{
  [super finalizeUpdates:updateMask];
  [self syncHostingViewIfNeeded];
}

- (void)layoutSubviews
{
  [super layoutSubviews];
  [self syncHostingViewIfNeeded];
}

- (void)prepareForRecycle
{
  for (UIView *child in _childComponentViews) {
    [child removeFromSuperview];
  }
  [_childComponentViews removeAllObjects];
  [_layoutCoordinator clearStyles];
  _reorderableEventEmitter.reset();
  _needsSync = YES;
  [_hostingView updateWithMode:@"reorder"
                    entryKinds:@[]
                      entryIds:@[]
                 collectionIds:@[]
               orderedEntryIds:@[]
                    childViews:@[]
                   selectedIds:@[]
                       enabled:NO];
  [super prepareForRecycle];
}

- (void)invalidate
{
  [_hostingView invalidate];
  _reorderableEventEmitter.reset();
  [super invalidate];
}

- (void)syncHostingViewIfNeeded
{
  if (!_needsSync) {
    return;
  }
  _needsSync = NO;

  const auto &props = *std::static_pointer_cast<ReorderableViewProps const>(_props);
  NSArray<NSString *> *entryKinds = RNStringArray(props.entryKinds);
  NSArray<NSString *> *entryIds = RNStringArray(props.entryIds);
  NSArray<NSString *> *collectionIds = RNStringArray(props.collectionIds);
  NSArray<NSString *> *orderedEntryIds = RNStringArray(props.orderedEntryIds);
  NSArray<NSString *> *selectedIds = RNStringArray(props.selectedIds);

  [_layoutCoordinator clearStyles];
  [_layoutCoordinator setYogaStyle:props.yogaStyle forScope:@"root"];

  const NSUInteger count = MIN(
      _childComponentViews.count,
      MIN(entryKinds.count, MIN(entryIds.count, collectionIds.count)));
  NSMutableDictionary<NSString *, UIView<RCTComponentViewProtocol> *> *viewsByIdentifier =
      [NSMutableDictionary new];
  // Fabric mutation indices are transient while differently-shaped containers
  // replace one another. Resolve the final wrappers by their private native IDs.
  for (UIView<RCTComponentViewProtocol> *componentView in _childComponentViews) {
    auto childProps = std::static_pointer_cast<const YogaStylableProps>([componentView props]);
    NSString *nativeIdentifier = RNString(childProps->nativeId);
    if (nativeIdentifier.length > 0) {
      viewsByIdentifier[nativeIdentifier] = componentView;
    }
  }

  NSMutableArray<UIView<RCTComponentViewProtocol> *> *orderedChildViews =
      [NSMutableArray arrayWithCapacity:count];
  NSMutableArray<NSString *> *identifiers = [NSMutableArray arrayWithCapacity:count];
  for (NSUInteger index = 0; index < count; index++) {
    NSString *identifier = [NSString stringWithUTF8String:
        RNLayoutIdentifier(entryKinds[index], entryIds[index], collectionIds[index]).c_str()];
    UIView<RCTComponentViewProtocol> *componentView = viewsByIdentifier[identifier];
    if (componentView == nil) {
      componentView = _childComponentViews[index];
    }
    [identifiers addObject:identifier];
    [orderedChildViews addObject:componentView];
  }

  for (NSUInteger index = 0; index < count; index++) {
    UIView<RCTComponentViewProtocol> *componentView = orderedChildViews[index];
    auto childProps = std::static_pointer_cast<const YogaStylableProps>(
        [componentView props]);
    NSString *identifier = identifiers[index];
    [_layoutCoordinator setYogaStyle:childProps->yogaStyle forIdentifier:identifier];
    if ([entryKinds[index] isEqualToString:@"section"]) {
      [_layoutCoordinator setYogaStyle:childProps->yogaStyle forScope:identifier];
    }
  }

  NSString *mode = props.mode == ReorderableViewMode::DragDrop ? @"dragDrop" : @"reorder";
  [_hostingView updateWithMode:mode
                    entryKinds:entryKinds
                      entryIds:entryIds
                 collectionIds:collectionIds
               orderedEntryIds:orderedEntryIds
                    childViews:orderedChildViews
                   selectedIds:selectedIds
                       enabled:props.enabled];
}

@end
