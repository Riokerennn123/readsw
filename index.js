/// tes fitur baru :v

process.on('uncaughtException', console.error)
const {
  default: WAConnect,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
  Browsers,
  fetchLatestWaWebVersion
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const readline = require('readline');
const { Boom } = require("@hapi/boom");
const config = require('./config'); // Import the config file

const pairingCode = process.argv.includes("--pairing-code");
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));
const store = makeInMemoryStore({ logger: pino().child({ level: "silent", stream: "store" }) });

// Melacak pengirim cerita
const storySenders = new Set(); 

// Variabel untuk menyimpan waktu mulai bot
let startTime = Date.now();

// Fungsi untuk menghitung uptime
function calculateUptime() {
  const now = Date.now();
  const uptimeMs = now - startTime;
  const seconds = Math.floor(uptimeMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  let uptimeString = "";
  if (days > 0) {
    uptimeString += `${days} hari `;
  }
  if (hours % 24 > 0) {
    uptimeString += `${hours % 24} jam `;
  }
  if (minutes % 60 > 0) {
    uptimeString += `${minutes % 60} menit `;
  }
  uptimeString += `${seconds % 60} detik `;

  return uptimeString;
}


async function WAStart() {
  const { state, saveCreds } = await useMultiFileAuthState("./sesi");
  const { version, isLatest } = await fetchLatestWaWebVersion().catch(() => fetchLatestBaileysVersion());
  console.log(`Silahkan masukin nomor Whatsapp kamu contoh : 628xxxxxxxx`);

  const client = WAConnect({
    logger: pino({ level: "silent" }),
    printQRInTerminal: !pairingCode,
    browser: Browsers.ubuntu("Chrome"),
    auth: state,
  });

  store.bind(client.ev);

  if (pairingCode && !client.authState.creds.registered) {
    const phoneNumber = await question(`Silahkan masukin nomor Whatsapp kamu: `);
    let code = await client.requestPairingCode(phoneNumber);
    code = code?.match(/.{1,4}/g)?.join("-") || code;
    console.log(`⚠︎ Kode Whatsapp kamu : ` + code)
  }

// Fungsi untuk mengatur kecepatan melihat status
function setReadStatusSpeed(speed) {
  if (speed < 1000) {
    console.log("Kecepatan minimal 1 detik (1000 milidetik).");
    return 1000;
  } else {
    return speed;
  }
}

// Atur kecepatan awal
let readStatusSpeed = setReadStatusSpeed(1000); // 1 detik (1000 milidetik)

// Atur kecepatan melalui input console
rl.question("Masukkan kecepatan melihat status (dalam milidetik, minimal 1000): ", (input) => {
  readStatusSpeed = setReadStatusSpeed(parseInt(input));
  console.log(`Kecepatan melihat status diatur ke ${readStatusSpeed} milidetik.`);
});



  // Update Bio
  let bioActive = true; 
  let bioInterval = setInterval(async () => {
    if (bioActive) {
      const uptimeText = calculateUptime();
      await client.updateProfileStatus(`Aktif Selama ${uptimeText} ⏳`);
    } 
  }, 10000); // Update bio every 10 seconds

  client.ev.on("messages.upsert", async (chatUpdate) => {
    try {
      const m = chatUpdate.messages[0];
      if (!m.message) return;
      if (m.key && !m.key.fromMe && m.key.remoteJid === 'status@broadcast') {
        // Melacak pengirim
        storySenders.add(m.key.participant);
        console.log("Cerita Baru Dari 👤 ", m.pushName);

        // Membaca cerita
        await client.readMessages([m.key]);
        console.log("Cerita Sudah Di Baca 😎 ", m.pushName);

        // Tunggu sebelum membaca status berikutnya
        await new Promise(resolve => setTimeout(resolve, readStatusSpeed));
      }
    } catch (err) {
      console.log(err);
    }
  });

  // Auto call reject
  client.ev.on('call', async (call) => {
    if (config.autoCallReject) {
      console.log(`Automatically rejecting call from ${call.peerJid}`);
      await client.sendCallReject(call.peerJid);
    } else if (call.isVideo && config.autoCloseVideoCall) { 
      console.log(`Automatically ending video call from ${call.peerJid}`);
      await client.sendCallHangup(call.peerJid); 
    } else {
      console.log(`Incoming call from ${call.peerJid}`);
    }
  });

  // ... (sisa kode koneksi dan penanganan event)

  client.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;
      if (connection === "close") {
        clearInterval(bioInterval); // Stop bio update when bot disconnects
        let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
        if (reason === DisconnectReason.badSession) {
          console.log(`File Sesi Buruk, Silahkan Hapus Sesi dan Pindai Lagi`);
          process.exit();
        } else if (reason === DisconnectReason.connectionClosed) {
          console.log("Koneksi ditutup, menyambung kembali....");
          WAStart();
        } else if (reason === DisconnectReason.connectionLost) {
          console.log("Koneksi Hilang dari Server, menyambung kembali...");
          WAStart();
        } else if (reason === DisconnectReason.connectionReplaced) {
          console.log("Koneksi Diganti, Sesi Baru Dibuka, Silahkan Mulai Ulang Bot");
          process.exit();
        } else if (reason === DisconnectReason.loggedOut) {
          console.log(`Perangkat Keluar, Silahkan Hapus Folder Sesi dan Pindai Lagi.`);
          process.exit();
        } else if (reason === DisconnectReason.restartRequired) {
          console.log("Mulai Ulang Diperlukan, Memulai Ulang...");
          WAStart();
        } else if (reason === DisconnectReason.timedOut) {
          console.log("Koneksi Habis Waktu, Menyambung Kembali...");
          WAStart();
        } else {
          console.log(`Alasan Disconnect Tidak Diketahui: ${reason}|${connection}`);
          WAStart();
        }
      } else if (connection === "open") {
      console.log("Terhubung ke Readsw");
    }
  });

  client.ev.on("creds.update", saveCreds);

  return client;
}

WAStart();