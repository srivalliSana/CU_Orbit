package com.example.cu_orbit.data

/** POST /api/auth/sso — handoff token exchanged for a session. */
data class SsoResponse(
    val success: Boolean = false,
    val session: String? = null,
    val user: User? = null
)

/** GET /api/auth/me */
data class MeResponse(
    val user: User? = null
)
