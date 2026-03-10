Pod::Spec.new do |s|
  s.name         = "mobile-rppg-acquisition-sdk"
  s.version      = "0.1.0"
  s.summary      = "Native Vision Camera frame-summary plugin for the Mobile rPPG Acquisition SDK"
  s.homepage     = "https://example.invalid/mobile-rppg-acquisition-sdk"
  s.license      = "MIT"
  s.authors      = { "marting" => "marting@example.invalid" }
  s.platforms    = { :ios => "13.0" }
  s.source       = { :path => "." }
  s.source_files = "ios/**/*.{h,m,mm,swift}"
  s.frameworks   = "CoreMedia", "CoreVideo", "ImageIO", "Vision"
  s.dependency "React-Core"
  s.dependency "VisionCamera"
  s.swift_version = "5.0"
end
