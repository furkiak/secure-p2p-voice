/*
 * i18n.js — English / Turkish strings.
 *
 * Static markup carries English defaults and is re-labelled through
 * `data-i18n` / `data-i18n-attr="attr:key;attr2:key2"`. Dynamic text goes
 * through `I18n.t(key, {vars})`. A unit test keeps both dictionaries and the
 * markup in sync.
 */
(function (global) {
  'use strict';

  const SPV = global.SPV || (global.SPV = {});

  const en = {
    'app.title': 'Secure P2P Voice',
    'app.tagline': 'Serverless · Encrypted · Direct',
    'settings.open': 'Settings',

    'step.secret': 'Secret',
    'step.connect': 'Connect',
    'step.talk': 'Talk',

    'status.setup': 'Set a shared password to begin',
    'status.ready': 'Microphone ready · choose how to connect',
    'status.listenOnly': 'Listen-only mode · no microphone',
    'status.gathering': 'Preparing a secure code…',
    'status.offerReady': 'Invitation ready · send it to your contact',
    'status.waitingReply': 'Waiting for the reply code',
    'status.answerReady': 'Reply ready · send it back to the caller',
    'status.connecting': 'Connecting…',
    'status.connected': 'Connected securely',
    'status.unstable': 'Connection unstable…',
    'status.failed': 'Connection failed',
    'status.ended': 'Call ended',

    'setup.title': 'Choose a shared password',
    'setup.desc': 'Both of you enter the same password. It locks the connection codes you exchange, so only the two of you can read them.',
    'setup.invited': 'You received an invitation. Enter the password you agreed on to continue.',
    'setup.label': 'Shared password',
    'setup.placeholder': 'At least 8 characters',
    'setup.reveal': 'Show or hide password',
    'setup.generate': 'Generate a strong password',
    'setup.copy': 'Copy password',
    'setup.hint.empty': 'Tip: tap the dice for a strong random password, then read it to your contact over the phone or in person.',
    'setup.hint.weak': 'Anyone who intercepts a code could guess a password like this offline. Tap the dice for a strong one.',
    'setup.hint.fair': 'Acceptable, but a longer password or the dice button is safer.',
    'setup.hint.good': 'Good. Share it in person or by phone, never together with the code.',
    'setup.fact1': 'The password never leaves this device and is never stored.',
    'setup.fact2': 'Share it through a different channel than the connection code.',
    'setup.continue': 'Enable microphone & continue',
    'strength.0': 'Very weak',
    'strength.1': 'Weak',
    'strength.2': 'Fair',
    'strength.3': 'Strong',
    'strength.4': 'Excellent',

    'mic.retry': 'Try again',
    'mic.listenOnly': 'Continue without microphone',
    'mic.denied': 'Microphone access was blocked. Allow it in your browser settings and try again, or continue in listen-only mode.',
    'mic.notFound': 'No microphone was found on this device. You can still listen and chat.',
    'mic.busy': 'The microphone is being used by another app.',
    'mic.insecure': 'Microphone access needs a secure page (https or localhost).',

    'role.caller': 'Start a call',
    'role.callee': 'Join a call',

    'caller.s1.title': 'Create an invitation',
    'caller.s1.desc': 'Generates an encrypted code. Send it to the person you want to call.',
    'caller.s1.button': 'Create invitation',
    'caller.s1.again': 'Create a new invitation',
    'caller.s2.title': 'Paste the reply',
    'caller.s2.desc': 'When your contact sends their reply code back, paste it here.',
    'caller.s2.placeholder': 'Paste the reply code…',
    'caller.s2.button': 'Connect',
    'callee.s1.title': 'Paste the invitation',
    'callee.s1.desc': 'Paste the code (or link) you received from the caller.',
    'callee.s1.placeholder': 'Paste the invitation code…',
    'callee.s1.button': 'Create reply',
    'callee.s2.title': 'Send the reply back',
    'callee.s2.desc': 'Send this code to the caller. They will connect from their side.',

    'code.invitation': 'Invitation code',
    'code.reply': 'Reply code',
    'code.meta': '{n} characters · valid for 30 minutes',
    'progress.gathering': 'Collecting secure connection details…',
    'progress.connecting': 'Establishing a direct connection…',
    'progress.waiting': 'Waiting for the caller to connect…',

    'action.copy': 'Copy',
    'action.share': 'Share',
    'action.qr': 'QR code',
    'action.scan': 'Scan QR',
    'action.close': 'Close',
    'action.changePassword': 'Change password',
    'action.startOver': 'Start over',

    'qr.alt': 'QR code',
    'qr.invite.hint': 'Let your contact scan this with their camera. It opens the app with your invitation filled in.',
    'qr.invite.hintRaw': 'Your contact can scan this with “Scan QR” in their app.',
    'qr.reply.hint': 'The caller can scan this with “Scan QR” in their app.',
    'scan.title': 'Scan QR code',
    'scan.hint': 'Point the camera at the code.',
    'scan.unsupported': 'QR scanning is not supported in this browser. Paste the code instead.',
    'scan.denied': 'Camera access was blocked.',

    'share.title': 'Secure P2P Voice',
    'share.text': 'Join my encrypted voice call:',
    'toast.copied': 'Copied to clipboard',
    'toast.copyFailed': 'Couldn’t copy. Select the text and copy it manually.',
    'toast.generated': 'Strong password created. Share it safely.',
    'toast.invitationLoaded': 'Invitation loaded from the link.',
    'toast.scanned': 'Code scanned.',
    'toast.callEnded': 'Call ended.',
    'toast.peerLeft': 'Your contact ended the call.',
    'toast.sasMismatch': 'The security codes differ. End the call and start again with a new password.',
    'toast.saved': 'Settings saved.',
    'toast.reset': 'Settings reset.',

    'err.generic': 'Something went wrong. Please try again.',
    'err.passwordEmpty': 'Enter a password first.',
    'err.passwordShort': 'Use at least 8 characters.',
    'err.codeEmpty': 'Paste a code first.',
    'err.BAD_FORMAT': 'That doesn’t look like a connection code.',
    'err.TRUNCATED': 'The code is incomplete. Copy the whole code and try again.',
    'err.BAD_PASSWORD': 'Couldn’t unlock the code. Make sure you both typed the same password.',
    'err.UNSUPPORTED_VERSION': 'This code was made by a different version of the app.',
    'err.WRONG_TYPE.expectAnswer': 'That is an invitation, but a reply code is needed here.',
    'err.WRONG_TYPE.expectOffer': 'That is a reply code. Invitations go into “Join a call”, replies into “Start a call”.',
    'err.EXPIRED': 'This code has expired, or the two device clocks differ a lot. Create a new one.',
    'err.NO_CANDIDATES': 'No network route was found. Check your connection or pick another connection helper in Settings.',
    'err.BAD_SDP': 'This code can’t be used to start a call. Create a fresh invitation.',
    'err.NO_CRYPTO': 'Encryption is unavailable here. Open the app over https or localhost.',
    'err.STATE': 'Create an invitation first.',

    'call.connecting': 'Connecting…',
    'call.connected': 'Connected',
    'call.unstable': 'Connection unstable',
    'call.failed': 'Connection lost',
    'call.encrypted': 'Encrypted',
    'call.peer': 'Contact',
    'call.you': 'You',
    'call.controls': 'Call controls',
    'call.muted': 'Muted',
    'call.listenOnly': 'Listening only',
    'call.speaking': 'Speaking',
    'call.mute': 'Mute microphone',
    'call.unmute': 'Unmute microphone',
    'call.mute.short': 'Mute',
    'call.unmute.short': 'Unmute',
    'call.chat': 'Open chat',
    'call.chat.short': 'Chat',
    'call.details': 'Connection details',
    'call.details.short': 'Details',
    'call.end': 'End call',
    'call.end.short': 'End',
    'call.audioBlocked': 'Your browser blocked audio playback.',
    'call.enableAudio': 'Tap to enable sound',

    'sas.title': 'Security code',
    'sas.help': 'Read these symbols to each other. If they are identical on both screens, nobody is listening in.',
    'sas.match': 'They match',
    'sas.differ': 'They differ',
    'sas.pending': 'Not verified',
    'sas.verified': 'Verified',
    'sas.mismatch': 'Mismatch',
    'sas.verifiedHelp': 'Verified. Your call is protected against interception.',
    'sas.mismatchHelp': 'The codes differ, so someone may be intercepting this call. End it and start again with a new password.',

    'chat.title': 'Encrypted chat',
    'chat.empty': 'Messages go straight to your contact, encrypted like the voice.',
    'chat.label': 'Message',
    'chat.placeholder': 'Type a message…',
    'chat.send': 'Send message',
    'chat.you': 'You',

    'details.title': 'Connection details',
    'details.route': 'Route',
    'details.latency': 'Latency',
    'details.jitter': 'Jitter',
    'details.loss': 'Packet loss',
    'details.down': 'Download',
    'details.up': 'Upload',
    'details.note': 'Audio is encrypted with DTLS-SRTP and flows directly between the two devices whenever the network allows it.',
    'route.lan': 'Local network',
    'route.p2p': 'Direct',
    'route.relay': 'Relayed',
    'route.lan.long': 'Local network (direct)',
    'route.p2p.long': 'Direct peer-to-peer',
    'route.relay.long': 'Via relay server (TURN)',

    'footer.privacy': 'No server · No account · No logs',
    'footer.source': 'Source code',

    'settings.title': 'Settings',
    'settings.appearance': 'Appearance',
    'settings.language': 'Language',
    'settings.theme': 'Theme',
    'settings.auto': 'Automatic',
    'settings.light': 'Light',
    'settings.dark': 'Dark',
    'settings.profile': 'Profile',
    'settings.name': 'Display name',
    'settings.name.placeholder': 'Optional',
    'settings.name.hint': 'Shown to the person you talk to, sent only over the encrypted connection.',
    'settings.audio': 'Audio',
    'settings.mic': 'Microphone',
    'settings.speaker': 'Speaker',
    'settings.defaultDevice': 'System default',
    'settings.device': 'Device {n}',
    'settings.quality': 'Voice quality',
    'settings.quality.low': 'Data saver · 16 kbps',
    'settings.quality.std': 'Standard · 32 kbps',
    'settings.quality.high': 'High · 64 kbps',
    'settings.echo': 'Echo cancellation',
    'settings.noise': 'Noise suppression',
    'settings.agc': 'Automatic gain',
    'settings.network': 'Network & privacy',
    'settings.ice': 'Connection helper',
    'settings.ice.google': 'Google STUN (default)',
    'settings.ice.cloudflare': 'Cloudflare STUN',
    'settings.ice.none': 'None — same network only',
    'settings.ice.custom': 'Custom servers…',
    'settings.ice.list': 'STUN / TURN servers',
    'settings.ice.listHint': 'One server per line. TURN entries need a username and password.',
    'settings.relay': 'Relay only (hide my IP)',
    'settings.ice.hint.google': 'A STUN server only helps your browser learn its public address. Google will see your IP address when you create a code.',
    'settings.ice.hint.cloudflare': 'A STUN server only helps your browser learn its public address. Cloudflare will see your IP address when you create a code.',
    'settings.ice.hint.none': 'Nothing is sent to any third party. Calls only work between devices on the same network.',
    'settings.ice.hint.custom': 'Use your own servers for full control. Invalid lines are ignored.',
    'settings.about': 'About',
    'settings.about.text': 'Settings are kept only in this browser. The shared password is never saved.',
    'settings.reset': 'Reset settings',
  };

  const tr = {
    'app.title': 'Güvenli P2P Ses',
    'app.tagline': 'Sunucusuz · Şifreli · Doğrudan',
    'settings.open': 'Ayarlar',

    'step.secret': 'Parola',
    'step.connect': 'Bağlan',
    'step.talk': 'Konuş',

    'status.setup': 'Başlamak için ortak bir parola belirleyin',
    'status.ready': 'Mikrofon hazır · bağlanma yöntemini seçin',
    'status.listenOnly': 'Yalnızca dinleme modu · mikrofon yok',
    'status.gathering': 'Güvenli kod hazırlanıyor…',
    'status.offerReady': 'Davet hazır · kişiye gönderin',
    'status.waitingReply': 'Yanıt kodu bekleniyor',
    'status.answerReady': 'Yanıt hazır · arayana geri gönderin',
    'status.connecting': 'Bağlanılıyor…',
    'status.connected': 'Güvenli bağlantı kuruldu',
    'status.unstable': 'Bağlantı kararsız…',
    'status.failed': 'Bağlantı kurulamadı',
    'status.ended': 'Görüşme sona erdi',

    'setup.title': 'Ortak bir parola seçin',
    'setup.desc': 'İkiniz de aynı parolayı girin. Parola, paylaştığınız bağlantı kodlarını kilitler; yalnızca ikiniz okuyabilirsiniz.',
    'setup.invited': 'Bir davet aldınız. Devam etmek için anlaştığınız parolayı girin.',
    'setup.label': 'Ortak parola',
    'setup.placeholder': 'En az 8 karakter',
    'setup.reveal': 'Parolayı göster / gizle',
    'setup.generate': 'Güçlü parola oluştur',
    'setup.copy': 'Parolayı kopyala',
    'setup.hint.empty': 'İpucu: zar simgesine dokunarak güçlü, rastgele bir parola oluşturun ve kişiye telefonda ya da yüz yüze söyleyin.',
    'setup.hint.weak': 'Bir kodu ele geçiren biri bu tür bir parolayı çevrimdışı tahmin edebilir. Güçlü bir parola için zara dokunun.',
    'setup.hint.fair': 'Kabul edilebilir, ancak daha uzun bir parola ya da zar düğmesi daha güvenlidir.',
    'setup.hint.good': 'İyi. Parolayı yüz yüze ya da telefonda paylaşın; asla kodla birlikte göndermeyin.',
    'setup.fact1': 'Parola bu cihazdan çıkmaz ve hiçbir yere kaydedilmez.',
    'setup.fact2': 'Parolayı bağlantı kodundan farklı bir kanaldan paylaşın.',
    'setup.continue': 'Mikrofonu aç ve devam et',
    'strength.0': 'Çok zayıf',
    'strength.1': 'Zayıf',
    'strength.2': 'Orta',
    'strength.3': 'Güçlü',
    'strength.4': 'Mükemmel',

    'mic.retry': 'Tekrar dene',
    'mic.listenOnly': 'Mikrofonsuz devam et',
    'mic.denied': 'Mikrofon erişimi engellendi. Tarayıcı ayarlarından izin verip tekrar deneyin ya da yalnızca dinleme modunda devam edin.',
    'mic.notFound': 'Bu cihazda mikrofon bulunamadı. Yine de dinleyebilir ve yazışabilirsiniz.',
    'mic.busy': 'Mikrofon başka bir uygulama tarafından kullanılıyor.',
    'mic.insecure': 'Mikrofon erişimi güvenli bir sayfa gerektirir (https veya localhost).',

    'role.caller': 'Arama başlat',
    'role.callee': 'Aramaya katıl',

    'caller.s1.title': 'Davet oluşturun',
    'caller.s1.desc': 'Şifreli bir kod üretir. Aramak istediğiniz kişiye gönderin.',
    'caller.s1.button': 'Davet oluştur',
    'caller.s1.again': 'Yeni davet oluştur',
    'caller.s2.title': 'Yanıtı yapıştırın',
    'caller.s2.desc': 'Karşı taraf yanıt kodunu gönderdiğinde buraya yapıştırın.',
    'caller.s2.placeholder': 'Yanıt kodunu yapıştırın…',
    'caller.s2.button': 'Bağlan',
    'callee.s1.title': 'Daveti yapıştırın',
    'callee.s1.desc': 'Arayandan aldığınız kodu (ya da bağlantıyı) yapıştırın.',
    'callee.s1.placeholder': 'Davet kodunu yapıştırın…',
    'callee.s1.button': 'Yanıt oluştur',
    'callee.s2.title': 'Yanıtı geri gönderin',
    'callee.s2.desc': 'Bu kodu arayana gönderin. Bağlantıyı onun tarafı kuracak.',

    'code.invitation': 'Davet kodu',
    'code.reply': 'Yanıt kodu',
    'code.meta': '{n} karakter · 30 dakika geçerli',
    'progress.gathering': 'Güvenli bağlantı bilgileri toplanıyor…',
    'progress.connecting': 'Doğrudan bağlantı kuruluyor…',
    'progress.waiting': 'Arayanın bağlanması bekleniyor…',

    'action.copy': 'Kopyala',
    'action.share': 'Paylaş',
    'action.qr': 'QR kod',
    'action.scan': 'QR tara',
    'action.close': 'Kapat',
    'action.changePassword': 'Parolayı değiştir',
    'action.startOver': 'Baştan başla',

    'qr.alt': 'QR kod',
    'qr.invite.hint': 'Karşı tarafın kamerasıyla okutmasını isteyin. Uygulama, davetiniz hazır halde açılır.',
    'qr.invite.hintRaw': 'Karşı taraf, uygulamasındaki “QR tara” ile bunu okutabilir.',
    'qr.reply.hint': 'Arayan, uygulamasındaki “QR tara” ile bunu okutabilir.',
    'scan.title': 'QR kod tara',
    'scan.hint': 'Kamerayı koda doğrultun.',
    'scan.unsupported': 'Bu tarayıcı QR taramayı desteklemiyor. Kodu yapıştırın.',
    'scan.denied': 'Kamera erişimi engellendi.',

    'share.title': 'Güvenli P2P Ses',
    'share.text': 'Şifreli sesli görüşmeme katıl:',
    'toast.copied': 'Panoya kopyalandı',
    'toast.copyFailed': 'Kopyalanamadı. Metni seçip elle kopyalayın.',
    'toast.generated': 'Güçlü parola oluşturuldu. Güvenle paylaşın.',
    'toast.invitationLoaded': 'Davet bağlantıdan yüklendi.',
    'toast.scanned': 'Kod okundu.',
    'toast.callEnded': 'Görüşme sona erdi.',
    'toast.peerLeft': 'Karşı taraf görüşmeyi sonlandırdı.',
    'toast.sasMismatch': 'Güvenlik kodları farklı. Görüşmeyi bitirin ve yeni bir parolayla baştan başlayın.',
    'toast.saved': 'Ayarlar kaydedildi.',
    'toast.reset': 'Ayarlar sıfırlandı.',

    'err.generic': 'Bir şeyler ters gitti. Lütfen tekrar deneyin.',
    'err.passwordEmpty': 'Önce bir parola girin.',
    'err.passwordShort': 'En az 8 karakter kullanın.',
    'err.codeEmpty': 'Önce bir kod yapıştırın.',
    'err.BAD_FORMAT': 'Bu bir bağlantı koduna benzemiyor.',
    'err.TRUNCATED': 'Kod eksik. Kodun tamamını kopyalayıp tekrar deneyin.',
    'err.BAD_PASSWORD': 'Kodun kilidi açılamadı. İkinizin de aynı parolayı yazdığından emin olun.',
    'err.UNSUPPORTED_VERSION': 'Bu kod uygulamanın farklı bir sürümüyle üretilmiş.',
    'err.WRONG_TYPE.expectAnswer': 'Bu bir davet kodu; burada yanıt kodu gerekiyor.',
    'err.WRONG_TYPE.expectOffer': 'Bu bir yanıt kodu. Davetler “Aramaya katıl”, yanıtlar “Arama başlat” sekmesine girilir.',
    'err.EXPIRED': 'Bu kodun süresi dolmuş ya da iki cihazın saati birbirinden çok farklı. Yeni bir tane oluşturun.',
    'err.NO_CANDIDATES': 'Ağ yolu bulunamadı. Bağlantınızı kontrol edin ya da Ayarlar’dan başka bir bağlantı yardımcısı seçin.',
    'err.BAD_SDP': 'Bu kodla arama başlatılamıyor. Yeni bir davet oluşturun.',
    'err.NO_CRYPTO': 'Şifreleme burada kullanılamıyor. Uygulamayı https veya localhost üzerinden açın.',
    'err.STATE': 'Önce bir davet oluşturun.',

    'call.connecting': 'Bağlanılıyor…',
    'call.connected': 'Bağlandı',
    'call.unstable': 'Bağlantı kararsız',
    'call.failed': 'Bağlantı koptu',
    'call.encrypted': 'Şifreli',
    'call.peer': 'Kişi',
    'call.you': 'Siz',
    'call.controls': 'Arama kontrolleri',
    'call.muted': 'Sessiz',
    'call.listenOnly': 'Yalnızca dinliyor',
    'call.speaking': 'Konuşuyor',
    'call.mute': 'Mikrofonu kapat',
    'call.unmute': 'Mikrofonu aç',
    'call.mute.short': 'Sessize al',
    'call.unmute.short': 'Sesi aç',
    'call.chat': 'Sohbeti aç',
    'call.chat.short': 'Sohbet',
    'call.details': 'Bağlantı ayrıntıları',
    'call.details.short': 'Ayrıntı',
    'call.end': 'Görüşmeyi bitir',
    'call.end.short': 'Bitir',
    'call.audioBlocked': 'Tarayıcınız ses oynatmayı engelledi.',
    'call.enableAudio': 'Sesi açmak için dokunun',

    'sas.title': 'Güvenlik kodu',
    'sas.help': 'Bu simgeleri birbirinize okuyun. İki ekranda da aynıysa kimse sizi dinlemiyor demektir.',
    'sas.match': 'Aynı',
    'sas.differ': 'Farklı',
    'sas.pending': 'Doğrulanmadı',
    'sas.verified': 'Doğrulandı',
    'sas.mismatch': 'Uyuşmuyor',
    'sas.verifiedHelp': 'Doğrulandı. Görüşmeniz dinlemeye karşı korunuyor.',
    'sas.mismatchHelp': 'Kodlar farklı; biri bu görüşmeyi dinliyor olabilir. Görüşmeyi bitirip yeni bir parolayla baştan başlayın.',

    'chat.title': 'Şifreli sohbet',
    'chat.empty': 'Mesajlar doğrudan karşı tarafa gider ve ses gibi şifrelenir.',
    'chat.label': 'Mesaj',
    'chat.placeholder': 'Bir mesaj yazın…',
    'chat.send': 'Mesajı gönder',
    'chat.you': 'Siz',

    'details.title': 'Bağlantı ayrıntıları',
    'details.route': 'Yol',
    'details.latency': 'Gecikme',
    'details.jitter': 'Titreşim (jitter)',
    'details.loss': 'Paket kaybı',
    'details.down': 'İndirme',
    'details.up': 'Yükleme',
    'details.note': 'Ses DTLS-SRTP ile şifrelenir ve ağ izin verdiği sürece iki cihaz arasında doğrudan akar.',
    'route.lan': 'Yerel ağ',
    'route.p2p': 'Doğrudan',
    'route.relay': 'Aktarmalı',
    'route.lan.long': 'Yerel ağ (doğrudan)',
    'route.p2p.long': 'Doğrudan eşler arası',
    'route.relay.long': 'Aktarma sunucusu üzerinden (TURN)',

    'footer.privacy': 'Sunucu yok · Hesap yok · Kayıt yok',
    'footer.source': 'Kaynak kodu',

    'settings.title': 'Ayarlar',
    'settings.appearance': 'Görünüm',
    'settings.language': 'Dil',
    'settings.theme': 'Tema',
    'settings.auto': 'Otomatik',
    'settings.light': 'Açık',
    'settings.dark': 'Koyu',
    'settings.profile': 'Profil',
    'settings.name': 'Görünen ad',
    'settings.name.placeholder': 'İsteğe bağlı',
    'settings.name.hint': 'Konuştuğunuz kişiye gösterilir; yalnızca şifreli bağlantı üzerinden gönderilir.',
    'settings.audio': 'Ses',
    'settings.mic': 'Mikrofon',
    'settings.speaker': 'Hoparlör',
    'settings.defaultDevice': 'Sistem varsayılanı',
    'settings.device': 'Cihaz {n}',
    'settings.quality': 'Ses kalitesi',
    'settings.quality.low': 'Veri tasarrufu · 16 kbps',
    'settings.quality.std': 'Standart · 32 kbps',
    'settings.quality.high': 'Yüksek · 64 kbps',
    'settings.echo': 'Yankı engelleme',
    'settings.noise': 'Gürültü bastırma',
    'settings.agc': 'Otomatik ses seviyesi',
    'settings.network': 'Ağ ve gizlilik',
    'settings.ice': 'Bağlantı yardımcısı',
    'settings.ice.google': 'Google STUN (varsayılan)',
    'settings.ice.cloudflare': 'Cloudflare STUN',
    'settings.ice.none': 'Yok — yalnızca aynı ağ',
    'settings.ice.custom': 'Özel sunucular…',
    'settings.ice.list': 'STUN / TURN sunucuları',
    'settings.ice.listHint': 'Her satıra bir sunucu. TURN girişleri kullanıcı adı ve parola ister.',
    'settings.relay': 'Yalnızca aktarma (IP’mi gizle)',
    'settings.ice.hint.google': 'STUN sunucusu yalnızca tarayıcınızın genel adresini öğrenmesine yardım eder. Kod oluştururken Google IP adresinizi görür.',
    'settings.ice.hint.cloudflare': 'STUN sunucusu yalnızca tarayıcınızın genel adresini öğrenmesine yardım eder. Kod oluştururken Cloudflare IP adresinizi görür.',
    'settings.ice.hint.none': 'Üçüncü taraflara hiçbir şey gönderilmez. Aramalar yalnızca aynı ağdaki cihazlar arasında çalışır.',
    'settings.ice.hint.custom': 'Tam denetim için kendi sunucularınızı kullanın. Geçersiz satırlar yok sayılır.',
    'settings.about': 'Hakkında',
    'settings.about.text': 'Ayarlar yalnızca bu tarayıcıda tutulur. Ortak parola asla kaydedilmez.',
    'settings.reset': 'Ayarları sıfırla',
  };

  const dictionaries = { en, tr };
  const listeners = [];
  let current = 'en';

  function detect() {
    const nav = (global.navigator && (global.navigator.languages?.[0] || global.navigator.language)) || 'en';
    return String(nav).toLowerCase().startsWith('tr') ? 'tr' : 'en';
  }

  function t(key, vars) {
    let s = dictionaries[current][key];
    if (s === undefined) s = en[key];
    if (s === undefined) return key;
    return vars ? s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] === undefined ? '' : vars[k])) : s;
  }

  /** Re-label static markup. */
  function apply(root) {
    const doc = global.document;
    if (!doc) return;
    root = root || doc;
    root.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
      for (const pair of el.dataset.i18nAttr.split(';')) {
        const [attr, key] = pair.split(':');
        if (attr && key) el.setAttribute(attr.trim(), t(key.trim()));
      }
    });
    doc.documentElement.lang = current;
    doc.title = t('app.title');
  }

  /** @param {'auto'|'en'|'tr'} pref */
  function setLanguage(pref) {
    current = pref === 'en' || pref === 'tr' ? pref : detect();
    apply();
    listeners.forEach((fn) => fn(current));
  }

  SPV.I18n = {
    dictionaries,
    t,
    apply,
    setLanguage,
    detect,
    get language() {
      return current;
    },
    onChange(fn) {
      listeners.push(fn);
    },
  };

  if (typeof module === 'object' && module.exports) module.exports = SPV.I18n;
})(typeof window !== 'undefined' ? window : globalThis);
