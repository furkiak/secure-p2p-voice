# 🔒 Serverless P2P Secure Voice Chat (Sunucusuz Güvenli Ses Hattı)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![WebRTC](https://img.shields.io/badge/Technology-WebRTC-blue.svg)](https://webrtc.org/)
[![Security](https://img.shields.io/badge/Encryption-AES--GCM-green.svg)](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt)

[English](#english) | [Türkçe](#türkçe)

---

<a name="english"></a>
## 🇬🇧 English

**Serverless P2P Secure Voice Chat** is a lightweight, browser-based voice communication tool that operates **without any backend signaling server**. 

Unlike traditional VoIP apps (WhatsApp, Zoom, Telegram), this application does **not** route your calls through a central server. Instead, it establishes a direct peer-to-peer connection between two devices using **Manual Signaling** (Copy-Paste mechanism).

### 🚀 Why is this Unique?
* **Zero Infrastructure:** No database, no WebSocket server, no accounts, no login.
* **Zero Logs:** Since there is no server handling the connection, there are no logs of *who* called *whom*, *when*, or for *how long*.
* **True End-to-End Encryption:** The connection setup (Signaling) is encrypted locally with a password you share, and the audio stream is encrypted via DTLS-SRTP.

### 🛠️ Technical Architecture

#### 1. The Signaling Problem & Solution
Normally, WebRTC requires a "Signaling Server" to exchange connection details (SDP - Session Description Protocol).
* **Traditional Apps:** User A sends SDP to Server -> Server sends to User B. (Server knows everything).
* **This Project:** User A generates SDP -> Encrypts it with AES-GCM -> Sends it manually (via SMS/Email/Signal) -> User B Decrypts it. **No server involved.**

#### 2. Security Layers
1.  **Signaling Encryption (AES-GCM):** The connection codes (SDP) are encrypted using **AES-GCM 256-bit** based on a shared password (PBKDF2 key derivation). Even if the text code is intercepted, it is useless without the password.
2.  **Media Encryption (DTLS-SRTP):** Once connected, the audio stream is encrypted using standard WebRTC protocols (DTLS-SRTP). No one on the network (ISP, Wi-Fi Admin) can listen to the audio.
3.  **Direct P2P:** Audio packets flow directly from IP to IP.

### 📖 How to Use
1.  Open the `index.html` on both devices (or the hosted URL).
2.  **Agree on a Password:** Both sides must enter the same secret password.
3.  **Initiate:**
    * **Caller:** Click "I will Call", then "Create Code". Copy the generated encrypted text and send it to the friend.
    * **Receiver:** Click "I am being Called", paste the code, click "Create Answer", and send the new code back.
4.  **Connect:** Caller pastes the answer code and clicks "Connect".
5.  **Talk:** The connection is now direct and secure.

### ⚠️ Privacy Note
Since this is a direct P2P connection, **connected peers can see each other's IP addresses**. Use a VPN if you want to hide your location from the person you are talking to.

---

<a name="türkçe"></a>
## 🇹🇷 Türkçe

**Sunucusuz P2P Güvenli Ses Hattı**, herhangi bir arka plan (backend) sunucusuna ihtiyaç duymadan çalışan, tarayıcı tabanlı, hafif ve ultra güvenli bir sesli iletişim aracıdır.

Geleneksel uygulamaların (WhatsApp, Zoom, Telegram) aksine, bu uygulama aramalarınızı merkezi bir sunucu üzerinden geçirmez. Bunun yerine, "Manuel Sinyalleşme" (Kopyala-Yapıştır yöntemi) kullanarak iki cihaz arasında doğrudan bağlantı kurar.

### 🚀 Neden Farklı?
* **Sıfır Altyapı:** Veritabanı yok, WebSocket sunucusu yok, üyelik yok, giriş yapmak yok.
* **Sıfır Log (Kayıt):** Bağlantıyı yöneten bir sunucu olmadığı için, *kimin* *kimi*, *ne zaman* aradığına dair hiçbir kayıt tutulamaz.
* **Gerçek Uçtan Uca Şifreleme:** Bağlantı kurma kodları (SDP) belirlediğiniz şifre ile kilitlenir, ses verisi ise DTLS-SRTP ile şifrelenir.

### 🛠️ Teknik Altyapı ve Güvenlik

#### 1. Sinyalleşme Sorunu ve Çözümü
Normalde WebRTC, bağlantı detaylarını (SDP) değiş tokuş etmek için bir "Sinyalleşme Sunucusu"na ihtiyaç duyar.
* **Geleneksel Uygulamalar:** A Kişisi SDP'yi Sunucuya atar -> Sunucu B Kişisine iletir. (Sunucu kimin kiminle konuştuğunu bilir).
* **Bu Proje:** A Kişisi SDP üretir -> **AES-GCM** ile şifreler -> Manuel olarak (SMS/WhatsApp/Signal) gönderir -> B Kişisi şifreyi çözer. **Arada sunucu yoktur.**

#### 2. Güvenlik Katmanları
1.  **Sinyalleşme Şifrelemesi (AES-GCM):** Bağlantı kodları, belirlediğiniz ortak şifre kullanılarak **AES-GCM 256-bit** standardında şifrelenir. Kod ele geçirilse bile şifre bilinmeden çözülemez.
2.  **Medya Şifrelemesi (DTLS-SRTP):** Bağlantı kurulduğunda, ses akışı standart WebRTC protokolleri (DTLS-SRTP) ile şifrelenir. Ağdaki kimse (Servis sağlayıcı, Wi-Fi yöneticisi) sesi dinleyemez.
3.  **Doğrudan P2P:** Ses paketleri doğrudan IP'den IP'ye akar.

### 📖 Nasıl Kullanılır?
1.  İki cihazda da uygulamayı açın.
2.  **Şifre Belirleyin:** İki taraf da "Ortak Güvenlik Şifresi" kutusuna aynı şifreyi girmelidir.
3.  **Başlatma:**
    * **Arayan:** "Ben Arayacağım" butonuna basar, kodu oluşturur ve arkadaşına gönderir.
    * **Aranan:** "Beni Arıyorlar" butonuna basar, gelen kodu yapıştırır, cevap kodunu oluşturup geri gönderir.
4.  **Bağlanma:** Arayan kişi gelen cevabı yapıştırır ve "Bağlan" der.
5.  **Konuşma:** Güvenli hat hazırdır.

### ⚠️ Gizlilik Notu
Bağlantı doğrudan P2P (Cihazdan Cihaza) olduğu için, **bağlı taraflar teknik olarak birbirlerinin IP adresini görebilir.** Eğer konuştuğunuz kişiden konumunuzu (IP adresinizi) gizlemek istiyorsanız, bir VPN kullanmanız önerilir.

---

### License
MIT License. Free to use, modify and distribute.
