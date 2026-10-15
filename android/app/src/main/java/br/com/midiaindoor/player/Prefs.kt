package br.com.midiaindoor.player

import android.content.Context

/** Guarda a URL do servidor e o token do dispositivo depois do pareamento. */
object Prefs {
    private const val FILE = "midiaindoor"
    private fun sp(c: Context) = c.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun serverUrl(c: Context): String = sp(c).getString("server", "") ?: ""
    fun token(c: Context): String = sp(c).getString("token", "") ?: ""
    fun deviceName(c: Context): String = sp(c).getString("name", "") ?: ""
    fun isPaired(c: Context): Boolean = token(c).isNotEmpty() && serverUrl(c).isNotEmpty()

    fun save(c: Context, server: String, token: String, name: String) {
        sp(c).edit()
            .putString("server", server.trimEnd('/'))
            .putString("token", token)
            .putString("name", name)
            .apply()
    }

    fun clear(c: Context) = sp(c).edit().clear().apply()
}
