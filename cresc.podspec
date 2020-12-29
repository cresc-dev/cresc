require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name         = 'Cresc'
  s.version      = package['version']
  s.summary      = package['description']
  s.license      = package['license']

  s.authors      = package['author']
  s.homepage     = package['homepage']

  s.cocoapods_version = '>= 1.6.0'
  s.platform = :ios, "8.0"
  s.source = { :git => 'https://github.com/cresc-dev/cresc.git', :tag => '#{s.version}' }
  s.libraries = 'bz2', 'z'
  s.vendored_libraries = 'RCTCresc/libRCTCresc.a'
  s.pod_target_xcconfig = { 'USER_HEADER_SEARCH_PATHS' => '"$(SRCROOT)/../node_modules/@cresc/core/ios"' }
  s.resource = 'ios/cresc_build_time.txt'
  s.script_phase = { :name => 'Generate build time', :script => 'set -x;date +%s > ${PODS_ROOT}/../../node_modules/@cresc/core/ios/cresc_build_time.txt', :execution_position => :before_compile }

  s.dependency 'React'
  s.dependency 'SSZipArchive'

  s.subspec 'Cresc-Core' do |ss|
    ss.source_files = 'ios/RCTCresc/*.{h,m}'
    ss.public_header_files = ['ios/RCTCresc/RCTCresc.h']
  end
  
  s.subspec 'HDiffPatch' do |ss|
    ss.source_files = ['ios/RCTCresc/HDiffPatch/**/*.{h,m,c}',
                       'android/jni/hpatch.{h,c}',
                       'android/jni/HDiffPatch/libHDiffPatch/HPatch/*.{h,c}',
                       'android/jni/HDiffPatch/file_for_patch.{h,c}',
                       'android/jni/lzma/C/LzmaDec.{h,c}',
                       'android/jni/lzma/C/Lzma2Dec.{h,c}']
    ss.private_header_files = 'ios/RCTCresc/HDiffPatch/**/*.h'
  end
end
