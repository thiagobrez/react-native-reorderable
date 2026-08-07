#import <UIKit/UIKit.h>

@class RNReorderableLayoutCoordinator;

NS_ASSUME_NONNULL_BEGIN

typedef void (^RNReorderableMoveHandler)(
    NSArray<NSString *> *sourceIds,
    NSString *destinationCollectionId,
    NSString *destinationBeforeId);
typedef void (^RNReorderableDropHandler)(NSArray<NSString *> *itemIds, NSString *destinationId);
typedef void (^RNReorderableDragActivateHandler)(NSArray<NSString *> *itemIds);
typedef void (^RNReorderableInteractionStateHandler)(BOOL active);

@interface RNReorderableHostingView : UIView

@property (nonatomic, copy, nullable) RNReorderableMoveHandler moveHandler;
@property (nonatomic, copy, nullable) RNReorderableDropHandler dropHandler;
@property (nonatomic, copy, nullable) RNReorderableDragActivateHandler dragActivateHandler;
@property (nonatomic, copy, nullable) RNReorderableInteractionStateHandler interactionStateHandler;

- (instancetype)initWithLayoutCoordinator:(RNReorderableLayoutCoordinator *)layoutCoordinator;
- (void)updateWithMode:(NSString *)mode
            entryKinds:(NSArray<NSString *> *)entryKinds
              entryIds:(NSArray<NSString *> *)entryIds
         collectionIds:(NSArray<NSString *> *)collectionIds
        parentEntryIds:(NSArray<NSString *> *)parentEntryIds
       orderedEntryIds:(NSArray<NSString *> *)orderedEntryIds
            childViews:(NSArray<UIView *> *)childViews
           selectedIds:(NSArray<NSString *> *)selectedIds
   acceptedDropZoneIds:(NSArray<NSString *> *)acceptedDropZoneIds
               enabled:(BOOL)enabled;
- (void)invalidate;
- (void)invalidateHostedLayout;
#if DEBUG
- (void)debugBeginInteraction;
- (void)debugEmitTerminalReorderWithSourceIds:(NSArray<NSString *> *)sourceIds
                      destinationCollectionId:(NSString *)destinationCollectionId
                          destinationBeforeId:(NSString *)destinationBeforeId;
- (void)debugBeginDropWithItemIds:(NSArray<NSString *> *)itemIds;
- (void)debugTargetDropWithDestinationId:(NSString *)destinationId;
- (void)debugEmitTerminalDropOutside:(BOOL)outside;
#endif

@end

NS_ASSUME_NONNULL_END
