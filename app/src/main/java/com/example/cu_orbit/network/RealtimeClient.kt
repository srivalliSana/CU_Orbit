package com.example.cu_orbit.network

import android.util.Log
import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONObject
import java.net.URI

/**
 * Realtime connection to CU Orbit.
 *
 * Mirrors the web client: the handshake carries the same session token as REST
 * calls, so a socket is never more privileged than an HTTP request. Polling
 * remains in place as a fallback, so a dropped socket degrades to "slightly
 * late" rather than "silently broken".
 */
object RealtimeClient {

    private const val TAG = "OrbitRealtime"
    private var socket: Socket? = null
    private val joined = mutableSetOf<String>()

    /** Listeners keyed by event, so callers can unsubscribe on teardown. */
    private val listeners = mutableMapOf<String, MutableList<(JSONObject) -> Unit>>()

    @Synchronized
    fun connect() {
        val token = SessionManager.token ?: return
        if (socket?.connected() == true) return

        val base = RetrofitClient.baseUrl.replace("/api/", "")
        try {
            val opts = IO.Options().apply {
                auth = mapOf("token" to token)
                transports = arrayOf("websocket", "polling")
                reconnection = true
                reconnectionDelay = 1000
                reconnectionDelayMax = 10000
            }
            val s = IO.socket(URI.create(base), opts)

            s.on(Socket.EVENT_CONNECT) {
                // The server forgets our rooms across a reconnect.
                synchronized(joined) { joined.forEach { id -> s.emit("join", id) } }
            }
            s.on(Socket.EVENT_CONNECT_ERROR) { args ->
                val message = args.firstOrNull()?.toString().orEmpty()
                Log.w(TAG, "connect error: $message")
                // A rejected session cannot be fixed by retrying.
                if (message.contains("unauthorized") || message.contains("token_expired")) {
                    disconnect()
                }
            }

            for (event in listOf("message", "read", "typing", "presence", "unread-changed", "channel-added")) {
                s.on(event) { args ->
                    val payload = args.firstOrNull() as? JSONObject ?: return@on
                    synchronized(listeners) { listeners[event]?.toList() }?.forEach { handler ->
                        // A listener must never take the socket thread down.
                        runCatching { handler(payload) }
                            .onFailure { Log.w(TAG, "listener for $event failed", it) }
                    }
                }
            }

            socket = s
            s.connect()
        } catch (e: Exception) {
            Log.w(TAG, "could not open socket", e)
        }
    }

    @Synchronized
    fun disconnect() {
        socket?.off()
        socket?.disconnect()
        socket = null
        synchronized(joined) { joined.clear() }
    }

    fun join(containerId: String?) {
        if (containerId.isNullOrBlank()) return
        synchronized(joined) { joined.add(containerId) }
        socket?.emit("join", containerId)
    }

    fun leave(containerId: String?) {
        if (containerId.isNullOrBlank()) return
        synchronized(joined) { joined.remove(containerId) }
        socket?.emit("leave", containerId)
    }

    fun sendTyping(containerId: String, name: String?) {
        socket?.emit("typing", JSONObject().apply {
            put("containerId", containerId)
            put("name", name ?: "")
        })
    }

    /** Subscribe to an event; returns a handle to remove it again. */
    fun on(event: String, handler: (JSONObject) -> Unit): () -> Unit {
        synchronized(listeners) { listeners.getOrPut(event) { mutableListOf() }.add(handler) }
        return { synchronized(listeners) { listeners[event]?.remove(handler) } }
    }
}
