#import <CoreGraphics/CoreGraphics.h>
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface RNReorderableLayoutResult : NSObject

@property (nonatomic, readonly) CGSize size;
@property (nonatomic, copy, readonly) NSArray<NSValue *> *frames;

- (instancetype)initWithSize:(CGSize)size frames:(NSArray<NSValue *> *)frames;

@end

@interface RNReorderableLayoutCoordinator : NSObject

- (RNReorderableLayoutResult *)layoutForScope:(NSString *)scope
                           orderedIdentifiers:(NSArray<NSString *> *)orderedIdentifiers
                               intrinsicSizes:(NSArray<NSValue *> *)intrinsicSizes
                                availableSize:(CGSize)availableSize;

@end

NS_ASSUME_NONNULL_END
