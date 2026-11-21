package expo.modules.subjectsegmentation

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import com.google.android.gms.common.moduleinstall.ModuleInstall
import com.google.android.gms.common.moduleinstall.ModuleInstallRequest
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentation
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenter
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenterOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.Executors
import kotlin.math.max
import kotlin.math.min

class SubjectSegmentationModule : Module() {
  // Un solo hilo: decodificar, convertir la máscara y responder fuera del hilo principal.
  private val executor = Executors.newSingleThreadExecutor()

  override fun definition() = ModuleDefinition {
    Name("SubjectSegmentation")

    Function("isSupported") { true }

    AsyncFunction("segment") { uri: String, maxSide: Int, tapX: Double, tapY: Double, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("E_CONTEXT", "Sin contexto de React", null)
      } else {
        executor.execute { run(context, uri, maxSide, tapX, tapY, promise) }
      }
    }
  }

  private fun run(context: Context, uri: String, maxSide: Int, tapX: Double, tapY: Double, promise: Promise) {
    try {
      val bitmap = decode(uri, maxSide) ?: return promise.reject("E_LOAD", "No se pudo leer la imagen", null)
      val multiple = tapX >= 0 && tapY >= 0
      val builder = SubjectSegmenterOptions.Builder()
      if (multiple) {
        builder.enableMultipleSubjects(SubjectSegmenterOptions.SubjectResultOptions.Builder().enableConfidenceMask().build())
      } else {
        builder.enableForegroundConfidenceMask()
      }
      val segmenter = SubjectSegmentation.getClient(builder.build())
      whenModelReady(context, segmenter, promise) {
        segmenter.process(InputImage.fromBitmap(bitmap, 0))
          .addOnSuccessListener(executor) { result ->
            try {
              val w = bitmap.width
              val h = bitmap.height
              val out = ByteArray(w * h)
              var any = false
              if (!multiple) {
                val mask = result.foregroundConfidenceMask
                if (mask != null) {
                  for (i in 0 until w * h) {
                    val v = mask.get(i).coerceIn(0f, 1f)
                    if (v > 0.5f) any = true
                    out[i] = (v * 255f + 0.5f).toInt().toByte()
                  }
                }
              } else {
                // Elegir el sujeto tocado; si el toque cae en fondo, se conservan todos.
                val px = min(w - 1, max(0, (tapX * w).toInt()))
                val py = min(h - 1, max(0, (tapY * h).toInt()))
                val subjects = result.subjects
                val hit = subjects.firstOrNull { s ->
                  val lx = px - s.startX
                  val ly = py - s.startY
                  lx >= 0 && ly >= 0 && lx < s.width && ly < s.height &&
                    (s.confidenceMask?.get(ly * s.width + lx) ?: 0f) > 0.5f
                }
                for (s in if (hit != null) listOf(hit) else subjects) {
                  val m = s.confidenceMask ?: continue
                  for (y in 0 until s.height) for (x in 0 until s.width) {
                    val v = m.get(y * s.width + x).coerceIn(0f, 1f)
                    if (v > 0.5f) any = true
                    val idx = (s.startY + y) * w + (s.startX + x)
                    val b = (v * 255f + 0.5f).toInt()
                    if (b > (out[idx].toInt() and 0xFF)) out[idx] = b.toByte()
                  }
                }
              }
              if (!any) {
                promise.reject("E_NO_SUBJECT", "No se detectó ningún sujeto", null)
              } else {
                promise.resolve(mapOf("width" to w, "height" to h, "data" to Base64.encodeToString(out, Base64.NO_WRAP)))
              }
            } catch (e: Exception) {
              promise.reject("E_SEGMENT", e.message ?: "Error al procesar la máscara", e)
            } finally {
              segmenter.close()
            }
          }
          .addOnFailureListener(executor) { e ->
            segmenter.close()
            promise.reject("E_SEGMENT", e.message ?: "ML Kit falló", e)
          }
      }
    } catch (e: Exception) {
      promise.reject("E_SEGMENT", e.message ?: "Error inesperado", e)
    }
  }

  /** ML Kit devuelve vacío si el modelo aún se está descargando: se espera a que Play services lo instale. */
  private fun whenModelReady(context: Context, segmenter: SubjectSegmenter, promise: Promise, ready: () -> Unit) {
    val client = ModuleInstall.getClient(context)
    client.areModulesAvailable(segmenter)
      .addOnSuccessListener(executor) { response ->
        if (response.areModulesAvailable()) {
          ready()
        } else {
          client.installModules(ModuleInstallRequest.newBuilder().addApi(segmenter).build())
            .addOnSuccessListener(executor) { ready() }
            .addOnFailureListener(executor) { e -> promise.reject("E_MODEL", "No se pudo descargar el modelo: ${e.message}", e) }
        }
      }
      .addOnFailureListener(executor) { ready() } // si no se puede comprobar, se intenta igualmente
  }

  /** Decodifica con inSampleSize y reduce a `maxSide` como máximo (nunca amplía). */
  private fun decode(uri: String, maxSide: Int): Bitmap? {
    val path = Uri.parse(uri).path ?: uri
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(path, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
    var sample = 1
    while (max(bounds.outWidth, bounds.outHeight) / sample > maxSide * 2) sample *= 2
    val bmp = BitmapFactory.decodeFile(path, BitmapFactory.Options().apply { inSampleSize = sample }) ?: return null
    val scale = min(1f, maxSide.toFloat() / max(bmp.width, bmp.height))
    return if (scale < 1f) Bitmap.createScaledBitmap(bmp, (bmp.width * scale).toInt().coerceAtLeast(1), (bmp.height * scale).toInt().coerceAtLeast(1), true) else bmp
  }
}
