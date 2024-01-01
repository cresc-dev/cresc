#import "RCTCresc.h"
#import "RCTCrescDownloader.h"
#import "RCTCrescManager.h"


#import <React/RCTConvert.h>
#import <React/RCTLog.h>
// #import <React/RCTReloadCommand.h>

static NSString *const keyCrescInfo = @"CRESC_INFO_KEY";
static NSString *const paramPackageVersion = @"packageVersion";
static NSString *const paramLastVersion = @"lastVersion";
static NSString *const paramCurrentVersion = @"currentVersion";
static NSString *const paramIsFirstTime = @"isFirstTime";
static NSString *const paramIsFirstLoadOk = @"isFirstLoadOK";
static NSString *const keyUuid = @"CRESC_UUID";
static NSString *const keyHashInfo = @"CRESC_HASH_";
static NSString *const keyFirstLoadMarked = @"CRESC_FIRSTLOADMARKED_KEY";
static NSString *const keyRolledBackMarked = @"CRESC_ROLLEDBACKMARKED_KEY";
static NSString *const KeyPackageUpdatedMarked = @"CRESC_ISPACKAGEUPDATEDMARKED_KEY";

// app info
static NSString * const AppVersionKey = @"appVersion";
static NSString * const BuildVersionKey = @"buildVersion";

// file def
static NSString * const BUNDLE_FILE_NAME = @"index.bundlejs";
static NSString * const SOURCE_PATCH_NAME = @"__diff.json";
static NSString * const BUNDLE_PATCH_NAME = @"index.bundlejs.patch";

// error def
static NSString * const ERROR_OPTIONS = @"options error";
static NSString * const ERROR_HDIFFPATCH = @"hdiffpatch error";
static NSString * const ERROR_FILE_OPERATION = @"file operation error";

// event def
static NSString * const EVENT_PROGRESS_DOWNLOAD = @"RCTCrescDownloadProgress";
// static NSString * const EVENT_PROGRESS_UNZIP = @"RCTCrescUnzipProgress";
static NSString * const PARAM_PROGRESS_HASH = @"hash";
static NSString * const PARAM_PROGRESS_RECEIVED = @"received";
static NSString * const PARAM_PROGRESS_TOTAL = @"total";


typedef NS_ENUM(NSInteger, CrescType) {
    CrescTypeFullDownload = 1,
    CrescTypePatchFromPackage = 2,
    CrescTypePatchFromPpk = 3,
    //TASK_TYPE_PLAIN_DOWNLOAD=4?
};

static BOOL ignoreRollback = false;

@implementation RCTCresc {
    RCTCrescManager *_fileManager;
    bool hasListeners;
}

@synthesize methodQueue = _methodQueue;

RCT_EXPORT_MODULE(RCTCresc);

+ (NSURL *)bundleURL
{
    NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
    
    NSDictionary *crescInfo = [defaults dictionaryForKey:keyCrescInfo];
    if (crescInfo) {
        NSString *curPackageVersion = [RCTCresc packageVersion];
        NSString *packageVersion = [crescInfo objectForKey:paramPackageVersion];
        
        BOOL needClearCrescInfo = ![curPackageVersion isEqualToString:packageVersion];
        if (needClearCrescInfo) {
            [defaults setObject:nil forKey:keyCrescInfo];
            [defaults setObject:@(YES) forKey:KeyPackageUpdatedMarked];
            [defaults synchronize];
            // ...need clear files later
        }
        else {
            NSString *curVersion = crescInfo[paramCurrentVersion];
            
            BOOL isFirstTime = [crescInfo[paramIsFirstTime] boolValue];
            BOOL isFirstLoadOK = [crescInfo[paramIsFirstLoadOk] boolValue];
            
            NSString *loadVersion = curVersion;
            BOOL needRollback = (!ignoreRollback && isFirstTime == NO && isFirstLoadOK == NO) || loadVersion.length<=0;
            if (needRollback) {
                loadVersion = [self rollback];
            }
            else if (isFirstTime && !ignoreRollback){
                // bundleURL may be called many times, ignore rollbacks before process restarted again.
                ignoreRollback = true;

                NSMutableDictionary *newInfo = [[NSMutableDictionary alloc] initWithDictionary:crescInfo];
                newInfo[paramIsFirstTime] = @(NO);
                [defaults setObject:newInfo forKey:keyCrescInfo];
                [defaults setObject:@(YES) forKey:keyFirstLoadMarked];
                [defaults synchronize];
            }
            
            NSString *downloadDir = [RCTCresc downloadDir];
            while (loadVersion.length) {
                NSString *bundlePath = [[downloadDir stringByAppendingPathComponent:loadVersion] stringByAppendingPathComponent:BUNDLE_FILE_NAME];
                if ([[NSFileManager defaultManager] fileExistsAtPath:bundlePath isDirectory:NULL]) {
                    NSURL *bundleURL = [NSURL fileURLWithPath:bundlePath];
                    return bundleURL;
                } else {
                    RCTLogError(@"RCTCresc -- bundle version %@ not found", loadVersion);
                    loadVersion = [self rollback];
                }
            }
        }
    }
    
    return [RCTCresc binaryBundleURL];
}

+ (NSString *) rollback {
    NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
    
    NSDictionary *crescInfo = [defaults dictionaryForKey:keyCrescInfo];
    NSString *lastVersion = crescInfo[paramLastVersion];
    NSString *curVersion = crescInfo[paramCurrentVersion];
    NSString *curPackageVersion = [RCTCresc packageVersion];
    if (lastVersion.length) {
        // roll back to last version
        [defaults setObject:@{paramCurrentVersion:lastVersion,
                              paramIsFirstTime:@(NO),
                              paramIsFirstLoadOk:@(YES),
                              paramPackageVersion:curPackageVersion}
                     forKey:keyCrescInfo];
    }
    else {
        // roll back to bundle
        [defaults setObject:nil forKey:keyCrescInfo];
    }
    [defaults setObject:curVersion forKey:keyRolledBackMarked];
    [defaults synchronize];
    return lastVersion;
}

+ (BOOL)requiresMainQueueSetup {
    // only set to YES if your module initialization relies on calling UIKit!
	return NO;
}

- (NSDictionary *)constantsToExport
{
    NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
    
    NSMutableDictionary *ret = [NSMutableDictionary new];
    ret[@"downloadRootDir"] = [RCTCresc downloadDir];
    ret[@"packageVersion"] = [RCTCresc packageVersion];
    ret[@"buildTime"] = [RCTCresc buildTime];
    ret[@"rolledBackVersion"] = [defaults objectForKey:keyRolledBackMarked];
    ret[@"isFirstTime"] = [defaults objectForKey:keyFirstLoadMarked];
    ret[@"uuid"] = [defaults objectForKey:keyUuid];
    NSDictionary *crescInfo = [defaults dictionaryForKey:keyCrescInfo];
    ret[@"currentVersion"] = [crescInfo objectForKey:paramCurrentVersion];
    
    // clear isFirstTimemarked
    if (ret[@"isFirstTime"]) {
        [defaults setObject:nil forKey:keyFirstLoadMarked];
    }
    
    // clear rolledbackmark
    if (ret[@"rolledBackVersion"] != nil) {
        [defaults setObject:nil forKey:keyRolledBackMarked];
        [self clearInvalidFiles];
    }
    
    // clear packageupdatemarked
    if ([[defaults objectForKey:KeyPackageUpdatedMarked] boolValue]) {
        [defaults setObject:nil forKey:KeyPackageUpdatedMarked];
        [self clearInvalidFiles];
    }
    [defaults synchronize];

    return ret;
}

- (instancetype)init
{
    self = [super init];
    if (self) {
        _fileManager = [RCTCrescManager new];
    }
    return self;
}

RCT_EXPORT_METHOD(setUuid:(NSString *)uuid)
{
    NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
    [defaults setObject:uuid forKey:keyUuid];
    [defaults synchronize];
}

RCT_EXPORT_METHOD(setLocalHashInfo:(NSString *)hash
                  value:(NSString *)value)
{
    NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
    [defaults setObject:value forKey:[keyHashInfo stringByAppendingString:hash]];
    [defaults synchronize];
}


RCT_EXPORT_METHOD(getLocalHashInfo:(NSString *)hash
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    
    NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
    resolve([defaults stringForKey:[keyHashInfo stringByAppendingString:hash]]);
}

RCT_EXPORT_METHOD(downloadFullUpdate:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    [self doCresc:CrescTypeFullDownload options:options callback:^(NSError *error) {
        if (error) {
            reject([NSString stringWithFormat: @"%lu", (long)error.code], error.localizedDescription, error);
        }
        else {
            resolve(nil);
        }
    }];
}

RCT_EXPORT_METHOD(downloadPatchFromPackage:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    [self doCresc:CrescTypePatchFromPackage options:options callback:^(NSError *error) {
        if (error) {
            reject([NSString stringWithFormat: @"%lu", (long)error.code], error.localizedDescription, error);
        }
        else {
            resolve(nil);
        }
    }];
}

RCT_EXPORT_METHOD(downloadPatchFromPpk:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    [self doCresc:CrescTypePatchFromPpk options:options callback:^(NSError *error) {
        if (error) {
            reject([NSString stringWithFormat: @"%lu", (long)error.code], error.localizedDescription, error);
        }
        else {
            resolve(nil);
        }
    }];
}

RCT_EXPORT_METHOD(setNeedUpdate:(NSDictionary *)options)
{
    NSString *hash = options[@"hash"];
    if (hash.length) {
        NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
        NSString *lastVersion = nil;
        if ([defaults objectForKey:keyCrescInfo]) {
            NSDictionary *crescInfo = [defaults objectForKey:keyCrescInfo];
            lastVersion = crescInfo[paramCurrentVersion];
        }
        
        NSMutableDictionary *newInfo = [[NSMutableDictionary alloc] init];
        newInfo[paramCurrentVersion] = hash;
        newInfo[paramLastVersion] = lastVersion;
        newInfo[paramIsFirstTime] = @(YES);
        newInfo[paramIsFirstLoadOk] = @(NO);
        newInfo[paramPackageVersion] = [RCTCresc packageVersion];
        [defaults setObject:newInfo forKey:keyCrescInfo];
        
        [defaults synchronize];
    }
}

RCT_EXPORT_METHOD(reloadUpdate:(NSDictionary *)options)
{
    NSString *hash = options[@"hash"];
    if (hash.length) {
        [self setNeedUpdate:options];
        
        // reload 0.62+
        // RCTReloadCommandSetBundleURL([[self class] bundleURL]);
        // RCTTriggerReloadCommandListeners(@"cresc reload");
        
       dispatch_async(dispatch_get_main_queue(), ^{
           [self.bridge setValue:[[self class] bundleURL] forKey:@"bundleURL"];
           [self.bridge reload];
       });
    }
}

RCT_EXPORT_METHOD(markSuccess)
{
    // up package info
    NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
    NSMutableDictionary *crescInfo = [[NSMutableDictionary alloc] initWithDictionary:[defaults objectForKey:keyCrescInfo]];
    [crescInfo setObject:@(NO) forKey:paramIsFirstTime];
    [crescInfo setObject:@(YES) forKey:paramIsFirstLoadOk];
    
    NSString *lastVersion = crescInfo[paramLastVersion];
    NSString *curVersion = crescInfo[paramCurrentVersion];
    if (lastVersion != nil && ![lastVersion isEqualToString:curVersion]) {
        [crescInfo removeObjectForKey:[keyHashInfo stringByAppendingString:lastVersion]];
    }
    [defaults setObject:crescInfo forKey:keyCrescInfo];
    [defaults synchronize];
    
    // clear other package dir
    [self clearInvalidFiles];
}

#pragma mark - private
- (NSArray<NSString *> *)supportedEvents
{
  return @[
      EVENT_PROGRESS_DOWNLOAD, 
    //   EVENT_PROGRESS_UNZIP
      ];
}

// Will be called when this module's first listener is added.
-(void)startObserving {
    hasListeners = YES;
    // Set up any upstream listeners or background tasks as necessary
}

// Will be called when this module's last listener is removed, or on dealloc.
-(void)stopObserving {
    hasListeners = NO;
    // Remove upstream listeners, stop unnecessary background tasks
}


- (void)doCresc:(CrescType)type options:(NSDictionary *)options callback:(void (^)(NSError *error))callback
{
    NSString *updateUrl = [RCTConvert NSString:options[@"updateUrl"]];
    NSString *hash = [RCTConvert NSString:options[@"hash"]];
    if (updateUrl.length <= 0 || hash.length <= 0) {
        callback([self errorWithMessage:ERROR_OPTIONS]);
        return;
    }
    NSString *originHash = [RCTConvert NSString:options[@"originHash"]];
    if (type == CrescTypePatchFromPpk && originHash <= 0) {
        callback([self errorWithMessage:ERROR_OPTIONS]);
        return;
    }
    
    NSString *dir = [RCTCresc downloadDir];
    BOOL success = [_fileManager createDir:dir];
    if (!success) {
        callback([self errorWithMessage:ERROR_FILE_OPERATION]);
        return;
    }

    NSString *zipFilePath = [dir stringByAppendingPathComponent:[NSString stringWithFormat:@"%@%@",hash, [self zipExtension:type]]];
//    NSString *unzipDir = [dir stringByAppendingPathComponent:hash];

    RCTLogInfo(@"RCTCresc -- download file %@", updateUrl);
    [RCTCrescDownloader download:updateUrl savePath:zipFilePath progressHandler:^(long long receivedBytes, long long totalBytes) {
        if (self->hasListeners) {
            [self sendEventWithName:EVENT_PROGRESS_DOWNLOAD body:@{
                PARAM_PROGRESS_HASH:hash,
                PARAM_PROGRESS_RECEIVED:[NSNumber numberWithLongLong:receivedBytes],
                PARAM_PROGRESS_TOTAL:[NSNumber numberWithLongLong:totalBytes]
            }];
        }
    } completionHandler:^(NSString *path, NSError *error) {
        if (error) {
            callback(error);
        }
        else {
            RCTLogInfo(@"RCTCresc -- unzip file %@", zipFilePath);
            NSString *unzipFilePath = [dir stringByAppendingPathComponent:hash];
            [self->_fileManager unzipFileAtPath:zipFilePath toDestination:unzipFilePath progressHandler:^(NSString *entry,long entryNumber, long total) {
                // if (self->hasListeners) {
                //     [self sendEventWithName:EVENT_PROGRESS_UNZIP
                //                        body:@{
                //                            PARAM_PROGRESS_HASH:hash,
                //                            PARAM_PROGRESS_RECEIVED:[NSNumber numberWithLong:entryNumber],
                //                            PARAM_PROGRESS_TOTAL:[NSNumber numberWithLong:total]
                //                        }];
                // }
                
            } completionHandler:^(NSString *path, BOOL succeeded, NSError *error) {
                dispatch_async(self->_methodQueue, ^{
                    if (error) {
                        callback(error);
                    }
                    else {
                        switch (type) {
                            case CrescTypePatchFromPackage:
                            {
                                NSString *sourceOrigin = [[NSBundle mainBundle] resourcePath];
                                NSString *bundleOrigin = [[RCTCresc binaryBundleURL] path];
                                [self patch:hash fromBundle:bundleOrigin source:sourceOrigin callback:callback];
                            }
                                break;
                            case CrescTypePatchFromPpk:
                            {
                                NSString *lastVersionDir = [dir stringByAppendingPathComponent:originHash];
                                
                                NSString *sourceOrigin = lastVersionDir;
                                NSString *bundleOrigin = [lastVersionDir stringByAppendingPathComponent:BUNDLE_FILE_NAME];
                                [self patch:hash fromBundle:bundleOrigin source:sourceOrigin callback:callback];
                            }
                                break;
                            default:
                                callback(nil);
                                break;
                        }
                    }
                });
            }];
        }
    }];
}

- (void)_dopatch:(NSString *)hash fromBundle:(NSString *)bundleOrigin source:(NSString *)sourceOrigin
        callback:(void (^)(NSError *error))callback
{
    NSString *unzipDir = [[RCTCresc downloadDir] stringByAppendingPathComponent:hash];
    NSString *sourcePatch = [unzipDir stringByAppendingPathComponent:SOURCE_PATCH_NAME];
    NSString *bundlePatch = [unzipDir stringByAppendingPathComponent:BUNDLE_PATCH_NAME];
    
    NSString *destination = [unzipDir stringByAppendingPathComponent:BUNDLE_FILE_NAME];
    void (^completionHandler)(BOOL success) = ^(BOOL success) {
        if (success) {
            NSData *data = [NSData dataWithContentsOfFile:sourcePatch];
            NSError *error = nil;
            NSDictionary *json = [NSJSONSerialization JSONObjectWithData:data options:NSJSONReadingAllowFragments error:&error];
            if (error) {
                callback(error);
                return;
            }
            
            NSDictionary *copies = json[@"copies"];
            NSDictionary *deletes = json[@"deletes"];

            [self->_fileManager copyFiles:copies fromDir:sourceOrigin toDir:unzipDir deletes:deletes completionHandler:^(NSError *error) {
                if (error) {
                    callback(error);
                }
                else {
                    callback(nil);
                }
            }];
        }
        else {
            callback([self errorWithMessage:ERROR_HDIFFPATCH]);
        }
    };
    [_fileManager hdiffFileAtPath:bundlePatch fromOrigin:bundleOrigin toDestination:destination completionHandler:completionHandler];
}

- (void)patch:(NSString *)hash fromBundle:(NSString *)bundleOrigin source:(NSString *)sourceOrigin callback:(void (^)(NSError *error))callback
{
    [self _dopatch:hash fromBundle:bundleOrigin source:sourceOrigin callback:callback];
}

- (void)clearInvalidFiles
{
    NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
    NSDictionary *crescInfo = [defaults objectForKey:keyCrescInfo];
    NSString *curVersion = [crescInfo objectForKey:paramCurrentVersion];
    
    NSString *downloadDir = [RCTCresc downloadDir];
    NSError *error = nil;
    NSArray *list = [[NSFileManager defaultManager] contentsOfDirectoryAtPath:downloadDir error:&error];
    if (error) {
        return;
    }
    
    for(NSString *fileName in list) {
        if (![fileName isEqualToString:curVersion]) {
            [_fileManager removeFile:[downloadDir stringByAppendingPathComponent:fileName] completionHandler:nil];
        }
    }
}

- (NSString *)zipExtension:(CrescType)type
{
    switch (type) {
        case CrescTypeFullDownload:
            return @".ppk";
        case CrescTypePatchFromPackage:
            return @".ipa.patch";
        case CrescTypePatchFromPpk:
            return @".ppk.patch";
        default:
            break;
    }
}

- (NSError *)errorWithMessage:(NSString *)errorMessage
{
    return [NSError errorWithDomain:@"cn.reactnative.cresc"
                               code:-1
                           userInfo:@{ NSLocalizedDescriptionKey: errorMessage}];
}

+ (NSString *)downloadDir
{
    NSString *directory = [NSSearchPathForDirectoriesInDomains(NSApplicationSupportDirectory, NSUserDomainMask, YES) firstObject];
    NSString *downloadDir = [directory stringByAppendingPathComponent:@"RCTCresc"];
    
    return downloadDir;
}

+ (NSURL *)binaryBundleURL
{
    NSURL *url = [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
    return url;
}

+ (NSString *)packageVersion
{
    static NSString *version = nil;

    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        NSDictionary *infoDictionary = [[NSBundle mainBundle] infoDictionary];
        version = [infoDictionary objectForKey:@"CFBundleShortVersionString"];
    });
    return version;
}

+ (NSString *)buildTime
{
#if DEBUG
    return @"0";
#else
    static NSString *buildTime;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
      NSString *buildTimePath = [[NSBundle mainBundle] pathForResource:@"cresc_build_time" ofType:@"txt"];
      buildTime = [[NSString stringWithContentsOfFile:buildTimePath encoding:NSUTF8StringEncoding error:nil]
                 stringByTrimmingCharactersInSet:[NSCharacterSet newlineCharacterSet]];
    });
    return buildTime;
#endif
}

@end
