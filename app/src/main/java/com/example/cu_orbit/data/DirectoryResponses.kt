package com.example.cu_orbit.data

import com.google.gson.annotations.SerializedName

/**
 * A person from the CampusOne directory.
 *
 * Identity fields (name, role, department) come from CampusOne, which is
 * authoritative. `id`, presence and lastSeenAt are CU Orbit state and are null
 * until that person has used the app — so `id` being null is normal, not an
 * error, and means "message them to create their account".
 */
data class DirectoryPerson(
    val email: String,
    val name: String = "",
    val role: String? = "student",
    val department: String? = null,
    val school: String? = null,
    val cohort: String? = null,
    val campus: String? = null,
    val regno: String? = null,
    @SerializedName("is_hod") val isHod: Boolean = false,
    val id: String? = null,
    val avatarUrl: String? = null,
    val presence: String? = null,
    @SerializedName("last_seen_at") val lastSeenAt: String? = null,
    val bio: String? = null,
    @SerializedName("in_orbit") val inOrbit: Boolean = false
)

data class DirectorySearchResponse(
    val results: List<DirectoryPerson> = emptyList(),
    @SerializedName("directory_available") val directoryAvailable: Boolean = false
)

data class PersonResponse(val person: DirectoryPerson? = null)

data class StartDmResponse(
    @SerializedName("dm_id") val dmId: String? = null,
    val user: User? = null
)

data class MessageReader(
    val id: String,
    val name: String = "",
    val avatarUrl: String? = null,
    @SerializedName("read_at") val readAt: String? = null
)

/** "Read by 3 of 7" on a group message. */
data class MessageReadsResponse(
    @SerializedName("read_count") val readCount: Int = 0,
    val audience: Int = 0,
    val readers: List<MessageReader> = emptyList()
)

data class UnreadResponse(
    val total: Int = 0,
    val channels: Int = 0,
    val dms: Int = 0
)
