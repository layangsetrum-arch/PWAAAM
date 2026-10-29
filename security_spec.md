# SPESIFIKASI KEAMANAN FIRESTORE (security_spec.md)

## 1. DATA INVARIANTS
1. **Multi-Tenant User Isolation**: Seluruh sub-koleksi (`services`, `persons`, `access`, `logs`, `handoffNotes`, `settings`) berada di bawah `/users/{userId}` dan HANYA dapat dibaca/ditulis oleh pengguna pemilik (`request.auth.uid == userId`).
2. **Identity Integrity**: Pengguna tidak dapat membaca atau menulis data milik `userId` lain.
3. **Immutability of Identifiers & Timestamps**: `id`, `createdAt`, dan kepemilikan parent tidak boleh diubah setelah dibuat.
4. **Relational Constraints**:
   - `Access` wajib mereferensikan `personId` dan `serviceId` yang sah di bawah namespace pengguna yang sama.
   - `UsageLog` wajib mereferensikan `accessId` yang sah.
   - `HandoffNote` wajib mereferensikan `serviceId` dan `accessId` yang sah.
5. **Boundary & Injection Prevention**:
   - String dibatasi panjang maksimum (`.size() <= MAX`).
   - ID dokumen wajib sesuai pola alphanumeric aman (`^[a-zA-Z0-9_\-]+$`).
   - Maksimum akun `persons` per pengguna dibatasi (maksimal 10 akun sesuai BR-07 & ASM-02).

---

## 2. THE DIRTY DOZEN PAYLOADS (12 Pengujian Penetrasi Negatif)

1. **Dirty Payload 1 (Cross-User Read)**: Pengguna A mencoba membaca `/users/user-B/persons/p-1`. -> **PERMISSON_DENIED**
2. **Dirty Payload 2 (Cross-User Write)**: Pengguna A mencoba membuat dokumen di `/users/user-B/services/srv-x`. -> **PERMISSION_DENIED**
3. **Dirty Payload 3 (Unauthenticated Read)**: Klien tanpa `request.auth` membaca `/users/any-user/settings/default`. -> **PERMISSION_DENIED**
4. **Dirty Payload 4 (Identity Spoofing in Document)**: Pengguna A membuat User doc `/users/user-A` dengan ID payload `user-B`. -> **PERMISSION_DENIED**
5. **Dirty Payload 5 (Junk ID Poisoning)**: Membuat dokumen dengan ID sepanjang 500 karakter atau karakter kontrol berbahaya `../../etc`. -> **PERMISSION_DENIED**
6. **Dirty Payload 6 (Shadow Field Injection)**: Mengirim payload `Service` dengan field liar `__ghostRole: 'admin'`. -> **PERMISSION_DENIED**
7. **Dirty Payload 7 (State Skipping / Status Hijack)**: Mengubah `Access.status` dari `limited` menjadi `ready` secara langsung tanpa melewati validasi reset time. -> **PERMISSION_DENIED**
8. **Dirty Payload 8 (Denial of Wallet String Bomb)**: Mengirim `HandoffNote.text` dengan ukuran string 1MB. -> **PERMISSION_DENIED**
9. **Dirty Payload 9 (Immutable Field Modification)**: Melakukan update pada `Person` dengan mengubah `createdAt` atau `id`. -> **PERMISSION_DENIED**
10. **Dirty Payload 10 (Type Poisoning on Numeric Field)**: Mengirim `UsageLog.durationSec` bertipe string `"two hours"`. -> **PERMISSION_DENIED**
11. **Dirty Payload 11 (Invalid URL Protocol Injection)**: Mengirim `Service.urlTemplate` dengan skema `javascript:alert(1)`. -> **PERMISSION_DENIED**
12. **Dirty Payload 12 (Quota Bypass - Person 11)**: Mencoba membuat `Person` ke-11 saat kuota akun sudah mencapai 10. -> **PERMISSION_DENIED**
