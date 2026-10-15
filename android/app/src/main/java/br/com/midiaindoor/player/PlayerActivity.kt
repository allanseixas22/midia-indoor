package br.com.midiaindoor.player

import android.annotation.SuppressLint
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.WindowManager
import androidx.appcompat.app.AppCompatActivity
import br.com.midiaindoor.player.databinding.ActivityPlayerBinding
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Executors

/**
 * Player em tela cheia. Mantém a tela ligada, baixa as mídias para o cache,
 * exibe a playlist em loop e re-sincroniza a programação periodicamente.
 * Se a internet cair, continua tocando o que estiver no cache.
 */
class PlayerActivity : AppCompatActivity() {

    private lateinit var b: ActivityPlayerBinding
    private val io = Executors.newSingleThreadExecutor()
    private val ui = Handler(Looper.getMainLooper())

    private var items: List<Item> = emptyList()
    private var index = 0
    private var lastScheduleJson = ""      // detecta mudança de programação
    private val SYNC_EVERY_MS = 30_000L    // re-checa a programação a cada 30s

    data class Item(val type: String, val durationMs: Long, val file: File, val name: String)

    @SuppressLint("SourceLockedOrientationActivity")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        b = ActivityPlayerBinding.inflate(layoutInflater)
        setContentView(b.root)
        goImmersive()

        b.video.setOnCompletionListener { next() }
        b.video.setOnErrorListener { _, _, _ -> next(); true }

        sync(firstRun = true)
        ui.postDelayed(syncLoop, SYNC_EVERY_MS)
    }

    private val syncLoop = object : Runnable {
        override fun run() { sync(firstRun = false); ui.postDelayed(this, SYNC_EVERY_MS) }
    }

    private fun sync(firstRun: Boolean) {
        val server = Prefs.serverUrl(this); val token = Prefs.token(this)
        io.execute {
            try {
                val sched = Api.schedule(server, token)
                val json = sched.toString()
                if (json == lastScheduleJson && !firstRun) return@execute  // nada mudou
                lastScheduleJson = json

                val pl = sched.optJSONObject("playlist")
                val arr: JSONArray = pl?.optJSONArray("items") ?: JSONArray()
                val cacheDir = File(cacheDir, "media").apply { mkdirs() }
                val newItems = ArrayList<Item>()
                for (i in 0 until arr.length()) {
                    val it = arr.getJSONObject(i)
                    val url = it.getString("url")                 // ex: /media/uuid.mp4
                    val fileName = url.substringAfterLast('/')
                    val dest = File(cacheDir, fileName)
                    Api.download(server, url, dest)               // baixa se faltar
                    newItems.add(
                        Item(
                            type = it.getString("type"),
                            durationMs = (it.optInt("duration", 10)).toLong() * 1000L,
                            file = dest,
                            name = it.optString("name", "")
                        )
                    )
                }
                cleanCache(cacheDir, newItems.map { it.file.name }.toSet())
                ui.post {
                    items = newItems
                    if (firstRun || index >= items.size) { index = 0; showCurrent() }
                }
            } catch (e: Exception) {
                // offline ou servidor fora: se já há conteúdo, segue tocando o cache
                ui.post { if (items.isEmpty()) b.message.text = "Sem conexão com o servidor.\nTentando novamente…" }
            }
        }
    }

    private fun showCurrent() {
        ui.removeCallbacks(advance)
        if (items.isEmpty()) {
            b.message.visibility = View.VISIBLE
            b.message.text = "Nenhuma mídia programada para esta tela."
            b.image.visibility = View.GONE; b.video.visibility = View.GONE
            b.video.stopPlayback()
            return
        }
        b.message.visibility = View.GONE
        val item = items[index]
        if (item.type == "video") {
            b.image.visibility = View.GONE
            b.video.visibility = View.VISIBLE
            b.video.setVideoPath(item.file.absolutePath)
            b.video.start()           // avança no onCompletion
        } else {
            b.video.visibility = View.GONE
            b.video.stopPlayback()
            b.image.visibility = View.VISIBLE
            b.image.setImageURI(android.net.Uri.fromFile(item.file))
            ui.postDelayed(advance, item.durationMs)
        }
    }

    private val advance = Runnable { next() }
    private fun next() { if (items.isNotEmpty()) { index = (index + 1) % items.size; showCurrent() } }

    private fun cleanCache(dir: File, keep: Set<String>) {
        dir.listFiles()?.forEach { if (it.name !in keep && !it.name.endsWith(".part")) it.delete() }
    }

    private fun goImmersive() {
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus); if (hasFocus) goImmersive()
    }

    override fun onDestroy() {
        super.onDestroy(); ui.removeCallbacksAndMessages(null); io.shutdownNow()
    }
}
