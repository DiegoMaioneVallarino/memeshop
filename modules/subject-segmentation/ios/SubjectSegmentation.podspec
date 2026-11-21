Pod::Spec.new do |s|
  s.name           = 'SubjectSegmentation'
  s.version        = '1.0.0'
  s.summary        = 'Segmentación de sujeto en el dispositivo (Vision)'
  s.description    = 'Máscara de primer plano con VNGenerateForegroundInstanceMaskRequest'
  s.author         = 'Memeshop'
  s.homepage       = 'https://example.invalid'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'Vision', 'ImageIO', 'CoreVideo'
  s.source_files   = '**/*.{h,m,mm,swift}'
end
