#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>


@interface RCTCresc : RCTEventEmitter<RCTBridgeModule>

+ (NSURL *)bundleURL;

@end
