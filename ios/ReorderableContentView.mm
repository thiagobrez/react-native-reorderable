#import "ReorderableContentView.h"

#import <react/renderer/components/ReorderableViewSpec/ComponentDescriptors.h>

using namespace facebook::react;

@implementation ReorderableContentView

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

@end
