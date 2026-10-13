Pod::Spec.new do |s|
  s.name           = 'PassmgrAutofill'
  s.version        = '1.0.0'
  s.summary        = 'Hands the vault logins to the iOS credential provider extension'
  s.author         = ''
  s.homepage       = 'https://github.com/'
  s.license        = 'UNLICENSED'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
