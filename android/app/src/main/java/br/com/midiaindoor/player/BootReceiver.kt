package br.com.midiaindoor.player

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Reabre o player automaticamente quando a TV/box liga. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED && Prefs.isPaired(context)) {
            val launch = Intent(context, PlayerActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(launch)
        }
    }
}
