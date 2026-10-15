package br.com.midiaindoor.player

import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/** Chamadas HTTP cruas (sem bibliotecas externas). Rodam sempre fora da main thread. */
object Api {

    data class PairResult(val token: String, val name: String)

    /** Troca o codigo de 6 digitos pelo token do dispositivo. */
    fun pair(server: String, code: String): PairResult {
        val conn = (URL("${server.trimEnd('/')}/api/player/pair").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            doOutput = true
            connectTimeout = 10000; readTimeout = 10000
            setRequestProperty("Content-Type", "application/json")
        }
        conn.outputStream.use { it.write(JSONObject().put("code", code).toString().toByteArray()) }
        val body = conn.readOrError()
        if (conn.responseCode !in 200..299) throw RuntimeException(JSONObject(body).optString("error", "Falha no pareamento"))
        val j = JSONObject(body)
        return PairResult(j.getString("token"), j.optString("name", "Tela"))
    }

    /** Busca a programacao atual (JSON) usando o token do dispositivo. */
    fun schedule(server: String, token: String): JSONObject {
        val conn = (URL("${server.trimEnd('/')}/api/player/schedule").openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 10000; readTimeout = 15000
            setRequestProperty("Authorization", "Bearer $token")
        }
        val body = conn.readOrError()
        if (conn.responseCode !in 200..299) throw RuntimeException("Programacao indisponivel (${conn.responseCode})")
        return JSONObject(body)
    }

    /** Baixa uma midia para o cache local, se ainda nao existir. Retorna o arquivo. */
    fun download(server: String, path: String, dest: File): File {
        if (dest.exists() && dest.length() > 0) return dest
        val tmp = File(dest.parentFile, dest.name + ".part")
        val conn = (URL("${server.trimEnd('/')}$path").openConnection() as HttpURLConnection).apply {
            connectTimeout = 15000; readTimeout = 60000
        }
        if (conn.responseCode !in 200..299) throw RuntimeException("Download falhou (${conn.responseCode})")
        conn.inputStream.use { input -> tmp.outputStream().use { input.copyTo(it, 64 * 1024) } }
        tmp.renameTo(dest)
        return dest
    }

    private fun HttpURLConnection.readOrError(): String {
        val stream = if (responseCode in 200..299) inputStream else errorStream
        return stream?.bufferedReader()?.use { it.readText() } ?: ""
    }
}
