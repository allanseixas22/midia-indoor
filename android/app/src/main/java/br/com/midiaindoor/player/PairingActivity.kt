package br.com.midiaindoor.player

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import br.com.midiaindoor.player.databinding.ActivityPairingBinding
import java.util.concurrent.Executors

/**
 * Primeira tela. Se já estiver pareado, pula direto para o player.
 * Senão, pede a URL do servidor e o código de 6 dígitos gerado no painel.
 */
class PairingActivity : AppCompatActivity() {

    private lateinit var b: ActivityPairingBinding
    private val io = Executors.newSingleThreadExecutor()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (Prefs.isPaired(this)) {
            startActivity(Intent(this, PlayerActivity::class.java))
            finish(); return
        }

        b = ActivityPairingBinding.inflate(layoutInflater)
        setContentView(b.root)

        b.pairButton.setOnClickListener {
            val server = b.serverInput.text.toString().trim()
            val code = b.codeInput.text.toString().trim()
            if (server.isEmpty() || code.length != 6) {
                Toast.makeText(this, "Preencha o endereço e o código de 6 dígitos", Toast.LENGTH_LONG).show()
                return@setOnClickListener
            }
            b.pairButton.isEnabled = false
            b.status.text = "Conectando…"
            io.execute {
                try {
                    val url = if (server.startsWith("http")) server else "http://$server"
                    val r = Api.pair(url, code)
                    Prefs.save(this, url, r.token, r.name)
                    runOnUiThread {
                        startActivity(Intent(this, PlayerActivity::class.java)); finish()
                    }
                } catch (e: Exception) {
                    runOnUiThread {
                        b.pairButton.isEnabled = true
                        b.status.text = "Erro: ${e.message}"
                    }
                }
            }
        }
    }
}
