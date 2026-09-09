
  Pod::Spec.new do |s|
    s.name = 'CapacitorBlobWriter'
    s.version = '0.0.1'
    s.summary = 'Write javascript Blobs to the filesystem efficiently'
    s.license = 'MIT'
    s.homepage = 'https://github.com/diachedelic/capacitor-blob-writer'
    s.author = 'James Diacono'
    s.source = { :git => 'https://github.com/diachedelic/capacitor-blob-writer', :tag => s.version.to_s }
    s.source_files = 'ios/Plugin/**/*.{swift,h,m,c,cc,mm,cpp}'
    s.ios.deployment_target  = '12.0'
    s.dependency 'Capacitor'
    s.dependency 'GCDWebServer', '~> 3.0'
  end
