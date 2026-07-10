#import <UIKit/UIKit.h>

@class RNReorderableLayoutCoordinator;

NS_ASSUME_NONNULL_BEGIN

typedef void (^RNReorderableMoveHandler)(
    NSArray<NSString *> *sourceIds,
    NSString *destinationCollectionId,
    NSString *destinationBeforeId);
typedef void (^RNReorderableDropHandler)(NSArray<NSString *> *itemIds, NSString *destinationId);

@interface RNReorderableHostingView : UIView

@property (nonatomic, copy, nullable) RNReorderableMoveHandler moveHandler;
@property (nonatomic, copy, nullable) RNReorderableDropHandler dropHandler;

- (instancetype)initWithLayoutCoordinator:(RNReorderableLayoutCoordinator *)layoutCoordinator;
- (void)updateWithMode:(NSString *)mode
            entryKinds:(NSArray<NSString *> *)entryKinds
              entryIds:(NSArray<NSString *> *)entryIds
         collectionIds:(NSArray<NSString *> *)collectionIds
       orderedEntryIds:(NSArray<NSString *> *)orderedEntryIds
            childViews:(NSArray<UIView *> *)childViews
           selectedIds:(NSArray<NSString *> *)selectedIds
               enabled:(BOOL)enabled;
- (void)invalidate;

@end

NS_ASSUME_NONNULL_END
