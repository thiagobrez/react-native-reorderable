#import "ReorderableContentView.h"
#import "ReorderableHostingView.h"

#import <react/renderer/components/ReorderableViewSpec/ComponentDescriptors.h>

using namespace facebook::react;

@implementation ReorderableContentView

{
  CGSize _lastReportedLayoutSize;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<ReorderableContentViewComponentDescriptor>();
}

+ (BOOL)shouldBeRecycled
{
  // Structural entries and items can have very different React subtrees. Keeping
  // these wrappers out of Fabric's recycle pool prevents a removed header from
  // being repurposed after it has already been handed to the SwiftUI host.
  return NO;
}

- (void)layoutSubviews
{
  [super layoutSubviews];
  CGSize size = self.bounds.size;
  if (CGSizeEqualToSize(size, _lastReportedLayoutSize)) {
    return;
  }
  _lastReportedLayoutSize = size;

  UIView *ancestor = self.superview;
  while (ancestor != nil && ![ancestor isKindOfClass:RNReorderableHostingView.class]) {
    ancestor = ancestor.superview;
  }
  [(RNReorderableHostingView *)ancestor invalidateHostedLayout];
}

@end
