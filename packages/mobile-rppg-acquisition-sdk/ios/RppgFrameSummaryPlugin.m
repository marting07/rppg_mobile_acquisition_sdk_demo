#import <VisionCamera/FrameProcessorPlugin.h>
#import <VisionCamera/FrameProcessorPluginRegistry.h>
#import "mobile_rppg_acquisition_sdk-Swift.h"

@interface RppgFrameSummaryPluginLoader : NSObject
@end

@implementation RppgFrameSummaryPluginLoader

+ (void)load
{
  [FrameProcessorPluginRegistry addFrameProcessorPlugin:@"summarizeRppgFrame"
                                        withInitializer:^FrameProcessorPlugin* _Nonnull(VisionCameraProxyHolder* _Nonnull proxy,
                                                                                        NSDictionary* _Nullable options) {
    return [[RppgFrameSummaryPlugin alloc] initWithProxy:proxy withOptions:options];
  }];
}

@end
