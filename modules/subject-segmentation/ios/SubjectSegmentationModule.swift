import ExpoModulesCore
import Vision
import ImageIO
import CoreVideo

struct SegError: Error { let code: String; let message: String }

public class SubjectSegmentationModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SubjectSegmentation")

    // La API de Vision para "levantar sujeto" existe desde iOS 17.
    Function("isSupported") { () -> Bool in
      if #available(iOS 17.0, *) { return true }
      return false
    }

    AsyncFunction("segment") { (uri: String, maxSide: Int, tapX: Double, tapY: Double, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        guard #available(iOS 17.0, *) else {
          promise.reject("E_UNSUPPORTED", "Requiere iOS 17 o superior")
          return
        }
        do {
          promise.resolve(try SubjectSegmenter.run(uri: uri, maxSide: maxSide, tapX: tapX, tapY: tapY))
        } catch let e as SegError {
          promise.reject(e.code, e.message)
        } catch {
          promise.reject("E_SEGMENT", error.localizedDescription)
        }
      }
    }
  }
}

@available(iOS 17.0, *)
enum SubjectSegmenter {
  static func run(uri: String, maxSide: Int, tapX: Double, tapY: Double) throws -> [String: Any] {
    guard let cg = loadImage(uri: uri, maxSide: maxSide) else {
      throw SegError(code: "E_LOAD", message: "No se pudo leer la imagen")
    }
    let handler = VNImageRequestHandler(cgImage: cg, options: [:])
    let request = VNGenerateForegroundInstanceMaskRequest()
    try handler.perform([request])
    guard let observation = request.results?.first, !observation.allInstances.isEmpty else {
      throw SegError(code: "E_NO_SUBJECT", message: "No se detectó ningún sujeto")
    }

    var instances = observation.allInstances
    if tapX >= 0, tapY >= 0 {
      let label = instanceLabel(observation.instanceMask, x: tapX, y: tapY)
      if label > 0 { instances = IndexSet(integer: Int(label)) }   // 0 = fondo -> se queda con todos
    }

    let buffer = try observation.generateScaledMaskForImage(forInstances: instances, from: handler)
    return try encode(buffer)
  }

  /// Miniatura con la orientación EXIF aplicada y como máximo `maxSide` px (nunca amplía).
  static func loadImage(uri: String, maxSide: Int) -> CGImage? {
    let url = uri.hasPrefix("file://") ? URL(string: uri) : URL(fileURLWithPath: uri)
    guard let url = url, let src = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
    var side = maxSide
    if let props = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [CFString: Any],
       let w = props[kCGImagePropertyPixelWidth] as? Int, let h = props[kCGImagePropertyPixelHeight] as? Int {
      side = min(maxSide, max(w, h))
    }
    let opts: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceShouldCacheImmediately: true,
      kCGImageSourceThumbnailMaxPixelSize: side,
    ]
    return CGImageSourceCreateThumbnailAtIndex(src, 0, opts as CFDictionary)
  }

  /// Etiqueta de instancia (UInt8, 0 = fondo) en el punto normalizado (origen arriba-izquierda).
  static func instanceLabel(_ buffer: CVPixelBuffer, x: Double, y: Double) -> UInt8 {
    CVPixelBufferLockBaseAddress(buffer, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
    guard let base = CVPixelBufferGetBaseAddress(buffer) else { return 0 }
    let w = CVPixelBufferGetWidth(buffer), h = CVPixelBufferGetHeight(buffer)
    let px = min(w - 1, max(0, Int(x * Double(w)))), py = min(h - 1, max(0, Int(y * Double(h))))
    let row = base.advanced(by: py * CVPixelBufferGetBytesPerRow(buffer)).assumingMemoryBound(to: UInt8.self)
    return row[px]
  }

  /// CVPixelBuffer (8 bits o Float32, una componente) -> A8 crudo en base64.
  static func encode(_ buffer: CVPixelBuffer) throws -> [String: Any] {
    CVPixelBufferLockBaseAddress(buffer, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
    guard let base = CVPixelBufferGetBaseAddress(buffer) else {
      throw SegError(code: "E_SEGMENT", message: "Máscara vacía")
    }
    let w = CVPixelBufferGetWidth(buffer), h = CVPixelBufferGetHeight(buffer)
    let bpr = CVPixelBufferGetBytesPerRow(buffer)
    var out = [UInt8](repeating: 0, count: w * h)
    switch CVPixelBufferGetPixelFormatType(buffer) {
    case kCVPixelFormatType_OneComponent8:
      for y in 0..<h {
        let row = base.advanced(by: y * bpr).assumingMemoryBound(to: UInt8.self)
        for x in 0..<w { out[y * w + x] = row[x] }
      }
    case kCVPixelFormatType_OneComponent32Float:
      for y in 0..<h {
        let row = base.advanced(by: y * bpr).assumingMemoryBound(to: Float.self)
        for x in 0..<w { out[y * w + x] = UInt8(max(0, min(1, row[x])) * 255 + 0.5) }
      }
    default:
      throw SegError(code: "E_SEGMENT", message: "Formato de máscara no soportado")
    }
    return ["width": w, "height": h, "data": Data(out).base64EncodedString()]
  }
}
